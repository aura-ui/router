import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface } from '../../core/types';
import { ViewContext } from '../../core/view';
import { ViewTeardownPipeline } from '../../core/view';
import {
  applyMountToSnapshot,
  EMPTY_MOUNT,
  mergeMount,
  mountContent,
  type MountSnapshot,
} from '../../core/view/outlet-adapter';
import {
  createMockDomCache,
  createMountContext,
  createOutlet,
  createViewContext,
  defineAuraOutlet,
  stageTwoViews,
} from '../_helpers';

function createTeardown(
  root: AuraOutlet,
  overrides: {
    route?: Partial<AuraRouteInterface>;
    cache?: ViewContext['config']['cache'];
    mount?: MountSnapshot;
  } = {},
): { teardown: ViewTeardownPipeline; ctx: ViewContext } {
  const ctx = createViewContext({
    root,
    route: overrides.route,
    cache: overrides.cache,
    mount: overrides.mount,
  });

  return { teardown: new ViewTeardownPipeline(ctx), ctx };
}

describe('ViewTeardownPipeline', () => {
  beforeAll(() => {
    defineAuraOutlet();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('commitStaged promotes staged view', () => {
    const root = createOutlet();
    const staged = stageTwoViews(root);
    const { teardown } = createTeardown(root, { mount: staged });

    teardown.commitStaged();

    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('new');
  });

  it('revertInFlight rolls back staged mount', () => {
    const root = createOutlet();
    const staged = stageTwoViews(root);
    const { teardown } = createTeardown(root, { mount: staged });

    teardown.revertInFlight();

    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('old');
  });

  it('onUnmount caches detached root when cache.dom is enabled', () => {
    const root = createOutlet();
    const stash = new Map<string, Element>();
    const mounted = mergeMount(
      EMPTY_MOUNT,
      mountContent(createMountContext({ appOutlet: root }), '<span>cached</span>')!,
    );
    const { teardown, ctx } = createTeardown(root, {
      route: { cache: { dom: true, view: false, data: false } },
      cache: createMockDomCache(stash),
      mount: mounted,
    });
    ctx.lastCacheKey = '/page';

    teardown.onUnmount({ domCacheKey: '/page' });

    expect(root.children).toHaveLength(0);
    expect(stash.get('/page')?.textContent).toBe('cached');
  });

  it('onUnmount clears outgoing handle on param-change remount', () => {
    const root = createOutlet();
    const staged = stageTwoViews(root);
    const { teardown, ctx } = createTeardown(root, {
      route: { cache: { dom: true, view: false, data: false } },
      mount: staged,
    });
    ctx.paramChangeRemount = true;

    teardown.onUnmount();

    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('new');
  });

  it('param-change replace unmount discards pending outgoing snapshot', () => {
    const root = createOutlet();
    const first = applyMountToSnapshot(EMPTY_MOUNT, createMountContext({ appOutlet: root }), '<span>view-1</span>')!;
    const replaced = applyMountToSnapshot(
      first,
      createMountContext({ appOutlet: root, pattern: '/user/2' }),
      '<span>view-2</span>',
    )!;
    const pending = replaced.pendingOutgoingRoot!;
    const { teardown, ctx } = createTeardown(root, { mount: replaced });
    ctx.paramChangeRemount = true;

    teardown.onUnmount();

    expect(root.textContent).toBe('view-2');
    expect(pending.isConnected).toBe(false);
    expect(ctx.mount.pendingOutgoingRoot).toBeNull();
  });

  it('commitStaged discards pending outgoing on replace mount', () => {
    const root = createOutlet();
    const first = applyMountToSnapshot(EMPTY_MOUNT, createMountContext({ appOutlet: root }), '<span>old</span>')!;
    const replaced = applyMountToSnapshot(
      first,
      createMountContext({ appOutlet: root, pattern: '/new' }),
      '<span>new</span>',
    )!;
    const { teardown } = createTeardown(root, { mount: replaced });

    teardown.commitStaged();

    teardown.revertInFlight();
    expect(root.textContent).toBe('new');
  });

  it('revertInFlight restores replace mount from detached snapshot', () => {
    const root = createOutlet();
    const first = applyMountToSnapshot(EMPTY_MOUNT, createMountContext({ appOutlet: root }), '<span>old</span>')!;
    const replaced = applyMountToSnapshot(
      first,
      createMountContext({ appOutlet: root, pattern: '/new' }),
      '<span>new</span>',
    )!;
    const { teardown } = createTeardown(root, { mount: replaced });

    teardown.revertInFlight();

    expect(root.textContent).toBe('old');
  });
});

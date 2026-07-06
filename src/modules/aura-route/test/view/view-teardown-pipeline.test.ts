import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_PRESERVE } from '../../../aura-routing-engine/core';
import type { AuraRouteInterface } from '../../core/types';
import {
  EMPTY_MOUNT,
  mergeMount,
  mountContent,
  type MountContext,
  type MountSnapshot,
} from '../../core/view/outlet-adapter';
import { ViewContext } from '../../core/view/view-context';
import { ViewTeardownPipeline } from '../../core/view/view-teardown-pipeline';
import { defaultViewCache } from '../../core/view/view-cache';

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function mountCtx(root: AuraOutlet, overrides: Partial<MountContext> = {}): MountContext {
  return { appOutlet: root, ...overrides };
}

function stageTwoViews(root: AuraOutlet): MountSnapshot {
  const first = mountContent(mountCtx(root), '<span>old</span>')!;
  const snapshot = mergeMount(EMPTY_MOUNT, first);
  const second = mountContent(mountCtx(root, { useStagedMount: true }), '<span>new</span>')!;

  return mergeMount(snapshot, second);
}

function createTeardown(
  root: AuraOutlet,
  overrides: {
    route?: Partial<AuraRouteInterface>;
    cache?: ViewContext['config']['cache'];
    mount?: MountSnapshot;
  } = {},
): { teardown: ViewTeardownPipeline; ctx: ViewContext } {
  const ctx = new ViewContext(
    {
      route: {
        path: '/page',
        layout: '',
        view: '',
        loadingTemplate: '',
        errorTemplate: '',
        preserve: NO_PRESERVE,
        scrollPolicy: null,
        transition: { order: null, in: null, out: null },
        ...overrides.route,
      } as AuraRouteInterface,
      content: { resolve: async () => null },
      cache: overrides.cache ?? defaultViewCache,
      mountTarget: {
        appOutlet: () => root,
        nestedOutlet: () => null,
      },
    },
    () => 1,
  );

  if (overrides.mount) {
    ctx.mount = overrides.mount;
  }

  return { teardown: new ViewTeardownPipeline(ctx), ctx };
}

describe('ViewTeardownPipeline', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
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

  it('onUnmount caches detached root when preserve.view is enabled', () => {
    const root = createOutlet();
    const stash = new Map<string, Element>();
    const mounted = mergeMount(
      EMPTY_MOUNT,
      mountContent(mountCtx(root), '<span>cached</span>')!,
    );
    const { teardown, ctx } = createTeardown(root, {
      route: { preserve: { view: true, data: false } },
      cache: {
        extract: (key) => {
          const node = stash.get(key);
          if (node) stash.delete(key);
          return node as never;
        },
        put: (key, node) => stash.set(key, node),
      },
      mount: mounted,
    });
    ctx.lastCacheKey = '/page';

    teardown.onUnmount({ cacheKey: '/page' });

    expect(root.children).toHaveLength(0);
    expect(stash.get('/page')?.textContent).toBe('cached');
  });

  it('onUnmount clears outgoing handle on param-change remount', () => {
    const root = createOutlet();
    const staged = stageTwoViews(root);
    const { teardown, ctx } = createTeardown(root, {
      route: { preserve: { view: true, data: false } },
      mount: staged,
    });
    ctx.paramChangeRemount = true;

    teardown.onUnmount();

    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('new');
  });
});

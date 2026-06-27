import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import {
  commitStaged,
  EMPTY_MOUNT,
  finalizeLeave,
  mergeMount,
  mountContent,
  reattachContent,
  resolveStageStrategy,
  rollbackStaged,
  hasActiveMount,
  unmountOnLeave,
  unmountHandle,
  type MountContext,
  type MountSlice,
  type MountSnapshot,
} from '../../core/view/outlet';

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function ctx(overrides: Partial<MountContext> & Pick<MountContext, 'appOutlet'>): MountContext {
  return overrides as MountContext;
}

function mount(context: MountContext, content: Node | string): MountSlice {
  const slice = mountContent(context, content);
  if (!slice) throw new Error('mountContent returned null');
  return slice;
}

function layoutWithOutlet(headerTag = 'header'): { fragment: DocumentFragment; nested: AuraOutlet } {
  const fragment = document.createDocumentFragment();
  const nested = document.createElement(AuraOutlet.is);
  fragment.append(document.createElement(headerTag), nested);
  return { fragment, nested };
}

describe('outlet', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('nestedOutlet = handle.findChildOutlet()', () => {
    it('layout: exposes nested outlet inside template', () => {
      const root = createOutlet();
      const { fragment, nested } = layoutWithOutlet();

      const result = mount(ctx({ appOutlet: root, pattern: '/users' }), fragment);

      expect(result.nestedOutlet).toBe(nested);
      expect(root.querySelector('header')).toBeTruthy();
    });

    it('layout: null when template has no nested outlet', () => {
      const root = createOutlet();

      const result = mount(ctx({ appOutlet: root, pattern: '/bare' }), '<header>only chrome</header>');

      expect(result.nestedOutlet).toBeNull();
      expect(result.activeHandle).not.toBeNull();
    });

    it('content leaf at root: null nestedOutlet', () => {
      const root = createOutlet();

      const result = mount(ctx({ appOutlet: root, pattern: '/' }), '<h1>Home</h1>');

      expect(result.nestedOutlet).toBeNull();
      expect(result.activeHandle?.mountOutlet).toBe(root);
      expect(root.textContent).toBe('Home');
    });

    it('content leaf under layout parent: mounts in parent slot, null nestedOutlet', () => {
      const root = createOutlet();
      const mountOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
      root.append(mountOutlet);

      const result = mount(
        ctx({ appOutlet: root, mountOutlet, pattern: '/users/about' }),
        '<span>about</span>',
      );

      expect(result.nestedOutlet).toBeNull();
      expect(result.activeHandle?.mountOutlet).toBe(mountOutlet);
      expect(mountOutlet.textContent).toBe('about');
    });

    it('content shell with nested outlet in loaded HTML exposes child slot', () => {
      const root = createOutlet();
      const shell =
        '<aside>Admin</aside><main><aura-outlet></aura-outlet></main>';

      const parent = mount(ctx({ appOutlet: root, pattern: '/admin' }), shell);

      const childSlot = parent.nestedOutlet;
      expect(childSlot).not.toBeNull();
      expect(childSlot).not.toBe(root);
      expect(childSlot?.closest('[data-aura-view-root]')).toBe(parent.activeHandle?.viewRoot);

      const child = mount(
        ctx({ appOutlet: root, mountOutlet: childSlot, pattern: '/admin/users' }),
        '<span>users</span>',
      );

      expect(child.nestedOutlet).toBeNull();
      expect(child.activeHandle?.mountOutlet).toBe(childSlot);
      expect(childSlot?.textContent).toBe('users');
      expect(root.querySelector('aside')?.textContent).toBe('Admin');
    });
  });

  describe('nested route chains', () => {
    it('layout → layout → content keeps both shells and mounts leaf in inner slot', () => {
      const root = createOutlet();

      const { fragment: l1Layout, nested: l1Slot } = layoutWithOutlet('header');
      const l1 = mount(ctx({ appOutlet: root, pattern: '/users' }), l1Layout);
      expect(l1.nestedOutlet).toBe(l1Slot);

      const { fragment: l2Layout, nested: l2Slot } = layoutWithOutlet('nav');
      const l2 = mount(
        ctx({ appOutlet: root, mountOutlet: l1.nestedOutlet, pattern: '/users/:id' }),
        l2Layout,
      );
      expect(l2.nestedOutlet).toBe(l2Slot);
      expect(l1Slot.querySelector('nav')).toBeTruthy();

      const l3 = mount(
        ctx({ appOutlet: root, mountOutlet: l2.nestedOutlet, pattern: '/users/:id/edit' }),
        '<p>edit form</p>',
      );

      expect(l3.nestedOutlet).toBeNull();
      expect(l3.activeHandle?.mountOutlet).toBe(l2Slot);
      expect(l2Slot.textContent).toBe('edit form');
      expect(root.querySelector('header')).toBeTruthy();
    });

    it('grandchild falls back to appOutlet (invalid nesting)', () => {
      const root = createOutlet();

      const parent = mount(ctx({ appOutlet: root, pattern: '/parent' }), '<p>no nested outlet</p>');
      expect(parent.nestedOutlet).toBeNull();

      const child = mount(
        ctx({ appOutlet: root, mountOutlet: parent.nestedOutlet, pattern: '/parent/child' }),
        '<span>child</span>',
      );

      expect(child.activeHandle?.mountOutlet).toBe(root);
      expect(root.textContent).toBe('child');
    });
  });

  describe('keepAlive re-attach', () => {
    it('unmountHandle returns detached root when keepAlive', () => {
      const root = createOutlet();
      const mounted = mount(ctx({ appOutlet: root, pattern: '/cached' }), '<span>cached</span>');
      const viewRoot = mounted.activeHandle!.viewRoot;

      const detached = unmountHandle(mounted.activeHandle, true);

      expect(detached).toBe(viewRoot);
      expect(detached?.isConnected).toBe(false);
      expect(root.children).toHaveLength(0);
    });

    it('unmountHandle destroys view when keepAlive is false', () => {
      const root = createOutlet();
      const mounted = mount(ctx({ appOutlet: root }), '<span>gone</span>');

      const detached = unmountHandle(mounted.activeHandle, false);

      expect(detached).toBeNull();
      expect(root.children).toHaveLength(0);
    });

    it('reattachContent re-inserts detached root from view cache', () => {
      const root = createOutlet();
      const first = mount(ctx({ appOutlet: root, pattern: '/cached' }), '<span>cached</span>');
      const detached = unmountHandle(first.activeHandle, true)!;

      const restored = reattachContent(ctx({ appOutlet: root, pattern: '/cached' }), detached);

      expect(restored?.activeHandle?.viewRoot).toBe(detached);
      expect(restored?.appliedStrategy).toBe('replace');
      expect(root.textContent).toBe('cached');
    });
  });

  describe('crossfade stage', () => {
    it('resolveStageStrategy stages when useStagedMount is true', () => {
      const root = createOutlet();
      mount(ctx({ appOutlet: root }), '<span>old</span>');

      expect(resolveStageStrategy(ctx({ appOutlet: root, useStagedMount: true }), root))
        .toBe('stage');
      expect(resolveStageStrategy(ctx({ appOutlet: root, useStagedMount: false }), root))
        .toBe('replace');
      expect(resolveStageStrategy(ctx({ appOutlet: root }), root))
        .toBe('replace');
    });

    it('mountContent stages alongside existing view; commitStage swaps roots', () => {
      const root = createOutlet();
      const old = mount(ctx({ appOutlet: root, pattern: '/old' }), '<span>old</span>');
      const oldRoot = old.activeHandle!.viewRoot;

      const staged = mountContent(
        ctx({ appOutlet: root, pattern: '/new', useStagedMount: true }),
        '<span>new</span>',
      )!;

      expect(staged.appliedStrategy).toBe('stage');
      expect(root.children).toHaveLength(2);
      expect(root.textContent).toBe('oldnew');

      staged.activeHandle!.mountOutlet.commitStage(staged.activeHandle!.viewRoot);

      expect(root.children).toHaveLength(1);
      expect(root.textContent).toBe('new');
      expect(root.contains(oldRoot)).toBe(false);
    });

    it('reattachContent always uses replace even when useStagedMount is true', () => {
      const root = createOutlet();
      const first = mount(ctx({ appOutlet: root }), '<span>cached</span>');
      const detached = unmountHandle(first.activeHandle, true)!;

      const restored = reattachContent(ctx({ appOutlet: root, useStagedMount: true }), detached);

      expect(restored?.appliedStrategy).toBe('replace');
      expect(root.children).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('returns null when signal is already aborted', () => {
      const root = createOutlet();
      const controller = new AbortController();
      controller.abort();

      const result = mountContent(ctx({ appOutlet: root, signal: controller.signal }), '<span>x</span>');

      expect(result).toBeNull();
      expect(root.children).toHaveLength(0);
    });

    it('uses first nested outlet when multiple are present', () => {
      const root = createOutlet();
      const first = document.createElement(AuraOutlet.is);
      const second = document.createElement(AuraOutlet.is);
      const layout = document.createDocumentFragment();
      layout.append(first, second);

      const result = mount(ctx({ appOutlet: root }), layout);

      expect(result.nestedOutlet).toBe(first);
    });
  });

  describe('hasActiveMount', () => {
    it('requires nested outlet for layout routes', () => {
      const withHandle = { activeHandle: {} as never, nestedOutlet: null };
      const withLayout = { activeHandle: {} as never, nestedOutlet: {} as never };

      expect(hasActiveMount(withHandle, false)).toBe(true);
      expect(hasActiveMount(withLayout, true)).toBe(true);
      expect(hasActiveMount(withHandle, true)).toBe(false);
      expect(hasActiveMount({ activeHandle: null, nestedOutlet: null }, false)).toBe(false);
    });
  });

  describe('MountSnapshot', () => {
    it('mergeMount preserves outgoing handle when staging', () => {
      const outgoing = { id: 'out' } as never;
      const incoming = { id: 'in' } as never;

      expect(
        mergeMount(
          { ...EMPTY_MOUNT, activeHandle: outgoing },
          { activeHandle: incoming, nestedOutlet: null, appliedStrategy: 'stage' },
        ),
      ).toEqual({
        strategy: 'stage',
        activeHandle: incoming,
        stageOutgoingHandle: outgoing,
        nestedOutlet: null,
      });
    });

    it('mergeMount clears stageOutgoingHandle on replace', () => {
      const outgoing = { id: 'out' } as never;
      const incoming = { id: 'in' } as never;

      expect(
        mergeMount(
          {
            strategy: 'stage',
            activeHandle: outgoing,
            stageOutgoingHandle: { id: 'prev-out' } as never,
            nestedOutlet: null,
          },
          { activeHandle: incoming, nestedOutlet: null, appliedStrategy: 'replace' },
        ),
      ).toEqual({
        strategy: 'replace',
        activeHandle: incoming,
        stageOutgoingHandle: null,
        nestedOutlet: null,
      });
    });

    function stageTwoViews(root: AuraOutlet): MountSnapshot {
      const first = mount(ctx({ appOutlet: root }), '<span>old</span>');
      let snapshot = mergeMount(EMPTY_MOUNT, first);
      const second = mountContent(
        ctx({ appOutlet: root, useStagedMount: true }),
        '<span>new</span>',
      )!;

      return mergeMount(
        {
          ...EMPTY_MOUNT,
          activeHandle: first.activeHandle,
          nestedOutlet: first.nestedOutlet,
        },
        second,
      );
    }

    it('commitStaged promotes incoming view', () => {
      const root = createOutlet();
      const staged = stageTwoViews(root);

      expect(root.children).toHaveLength(2);

      const committed = commitStaged(staged);
      expect(root.children).toHaveLength(1);
      expect(root.textContent).toBe('new');
      expect(committed.strategy).toBe('replace');
      expect(committed.stageOutgoingHandle).toBeNull();
    });

    it('rollbackStaged restores outgoing view', () => {
      const root = createOutlet();
      const staged = stageTwoViews(root);

      const restored = rollbackStaged(staged);
      expect(root.children).toHaveLength(1);
      expect(root.textContent).toBe('old');
      expect(restored.activeHandle).toBe(staged.stageOutgoingHandle);
      expect(restored.stageOutgoingHandle).toBeNull();
    });

    it('unmountOnLeave removes staged DOM and unmounts outgoing view', () => {
      const root = createOutlet();
      const staged = stageTwoViews(root);

      const { snapshot, detachedRoot } = unmountOnLeave(staged, false);
      expect(root.children).toHaveLength(0);
      expect(detachedRoot).toBeNull();
      expect(snapshot.activeHandle).toBeNull();
      expect(snapshot.stageOutgoingHandle).toBeNull();
    });

    it('unmountOnLeave unmounts active view on replace mount', () => {
      const root = createOutlet();
      const mounted = mergeMount(
        EMPTY_MOUNT,
        mount(ctx({ appOutlet: root }), '<span>page</span>'),
      );

      const { snapshot, detachedRoot } = unmountOnLeave(mounted, false);
      expect(root.children).toHaveLength(0);
      expect(detachedRoot).toBeNull();
      expect(snapshot.activeHandle).toBeNull();
    });

    it('unmountOnLeave detaches outgoing view when keepAlive', () => {
      const root = createOutlet();
      const staged = stageTwoViews(root);

      const { snapshot, detachedRoot } = unmountOnLeave(staged, true);
      expect(root.children).toHaveLength(0);
      expect(detachedRoot).not.toBeNull();
      expect(snapshot.activeHandle).toBeNull();
      expect(snapshot.stageOutgoingHandle).toBeNull();
    });

    it('finalizeLeave keeps nestedOutlet when stashing detached view', () => {
      const nested = {} as never;
      const state = { ...EMPTY_MOUNT, nestedOutlet: nested };
      const detached = document.createElement('div');

      expect(finalizeLeave(state, true, detached)).toBe(state);
    });

    it('finalizeLeave clears nestedOutlet when view is destroyed', () => {
      const state = { ...EMPTY_MOUNT, nestedOutlet: {} as never };

      expect(finalizeLeave(state, false, null)).toEqual({
        ...state,
        nestedOutlet: null,
      });
    });
  });
});

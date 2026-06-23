import { AuraOutlet, AURA_VIEW_ROOT_ATTR } from '../core/aura-outlet';

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function createViewRoot(): HTMLDivElement {
  const root = document.createElement('div');
  root.setAttribute(AURA_VIEW_ROOT_ATTR, '');
  return root;
}

describe('AuraOutlet', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('apply replace mounts view root', () => {
    const outlet = createOutlet();
    const root = createViewRoot();
    root.textContent = 'home';

    const handle = outlet.apply(root, { strategy: 'replace', key: '/' });
    expect(handle?.root).toBe(root);
    expect(handle?.key).toBe('/');
    expect(handle?.root.dataset.auraKey).toBe('/');
    expect(outlet.children).toHaveLength(1);
    expect(outlet.textContent).toBe('home');
  });

  it('apply replace sets data-aura-view-root on explicit roots', () => {
    const outlet = createOutlet();
    const root = document.createElement('div');
    root.textContent = 'plain';

    outlet.apply(root, { strategy: 'replace' });
    expect(root.hasAttribute(AURA_VIEW_ROOT_ATTR)).toBe(true);
  });

  it('apply patch updates content in active root', () => {
    const outlet = createOutlet();
    outlet.apply('<span>old</span>', { strategy: 'replace', key: '/a' });
    const handle = outlet.apply('<span>new</span>', { strategy: 'patch', key: '/a' });

    expect(handle?.root.hasAttribute(AURA_VIEW_ROOT_ATTR)).toBe(true);
    expect(outlet.querySelector('span')?.textContent).toBe('new');
    expect(outlet.children).toHaveLength(1);
  });

  it('apply patch reuses active root; route change passes key explicitly', () => {
    const outlet = createOutlet();
    const first = outlet.apply('<span>a</span>', { strategy: 'replace', key: '/a' });
    const second = outlet.apply('<span>b</span>', { strategy: 'patch', key: '/b' });

    expect(second?.root).toBe(first?.root);
    expect(outlet.querySelector('span')?.textContent).toBe('b');
    expect(second?.key).toBe('/b');
  });

  it('apply patch without key clears data-aura-key', () => {
    const outlet = createOutlet();
    outlet.apply('<span>a</span>', { strategy: 'replace', key: '/a' });

    const handle = outlet.apply('<span>b</span>', { strategy: 'patch' });
    expect(handle?.key).toBeUndefined();
    expect(handle?.root.dataset.auraKey).toBeUndefined();
  });

  it('apply stage keeps two roots until commitStage', () => {
    const outlet = createOutlet();
    const oldRoot = createViewRoot();
    oldRoot.textContent = 'old';
    const oldHandle = outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

    const newRoot = createViewRoot();
    newRoot.textContent = 'new';
    const newHandle = outlet.apply(newRoot, { strategy: 'stage', key: '/b' });

    expect(outlet.children).toHaveLength(2);
    expect(oldHandle?.key).toBe('/a');
    expect(newHandle?.key).toBe('/b');
    expect(newRoot.dataset.auraKey).toBe('/b');
    outlet.commitStage(newRoot);
    expect(outlet.children).toHaveLength(1);
    expect(newHandle?.key).toBe('/b');
    expect(outlet.textContent).toBe('new');
    oldHandle?.destroy();
    newHandle?.destroy();
  });

  it('commitStage clears activeKey when staged root has no key', () => {
    const outlet = createOutlet();
    const oldRoot = createViewRoot();
    outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

    const newRoot = createViewRoot();
    outlet.apply(newRoot, { strategy: 'stage' });
    outlet.commitStage(newRoot);

    expect(newRoot.dataset.auraKey).toBeUndefined();
  });

  it('staged handle has no key when staged root has no key', () => {
    const outlet = createOutlet();
    outlet.apply(createViewRoot(), { strategy: 'replace', key: '/a' });

    const stagedHandle = outlet.apply(createViewRoot(), { strategy: 'stage' });
    expect(stagedHandle?.key).toBeUndefined();
  });

  it('stage without key clears stale data-aura-key on explicit root', () => {
    const outlet = createOutlet();
    outlet.apply(createViewRoot(), { strategy: 'replace', key: '/a' });

    const stagedRoot = createViewRoot();
    stagedRoot.dataset.auraKey = '/stale';
    const handle = outlet.apply(stagedRoot, { strategy: 'stage' });

    expect(stagedRoot.dataset.auraKey).toBeUndefined();
    expect(handle?.key).toBeUndefined();
  });

  it('destroying active handle during stage promotes staged view', () => {
    const outlet = createOutlet();
    const oldRoot = createViewRoot();
    oldRoot.textContent = 'old';
    const oldHandle = outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

    const newRoot = createViewRoot();
    newRoot.textContent = 'new';
    outlet.apply(newRoot, { strategy: 'stage', key: '/b' });
    oldHandle?.destroy();

    const handle = outlet.apply('<span>patched</span>', { strategy: 'patch', key: '/b' });
    expect(handle?.root).toBe(newRoot);
    expect(newRoot.querySelector('span')?.textContent).toBe('patched');
    expect(outlet.children).toHaveLength(1);
  });

  it('replace without key clears data-aura-key on explicit root', () => {
    const outlet = createOutlet();
    const root = createViewRoot();
    root.dataset.auraKey = '/old';

    const handle = outlet.apply(root, { strategy: 'replace' });
    expect(root.dataset.auraKey).toBeUndefined();
    expect(handle?.key).toBeUndefined();
  });

  it('commitStage throws when root is not a direct child', () => {
    const outlet = createOutlet();
    const foreign = createViewRoot();
    expect(() => outlet.commitStage(foreign)).toThrow(DOMException);
  });

  it('cancelStage removes staged root and keeps active view', () => {
    const outlet = createOutlet();
    const oldRoot = createViewRoot();
    oldRoot.textContent = 'old';
    outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

    const newRoot = createViewRoot();
    newRoot.textContent = 'new';
    outlet.apply(newRoot, { strategy: 'stage', key: '/b' });
    expect(outlet.children).toHaveLength(2);

    outlet.cancelStage();
    expect(outlet.children).toHaveLength(1);
    expect(outlet.textContent).toBe('old');
    expect(oldRoot.dataset.auraKey).toBe('/a');
  });

  it('destroy clears root children, detach preserves them', () => {
    const outlet = createOutlet();
    const handle = outlet.apply('<span>keep</span>', { strategy: 'replace', key: '/x' });
    const detached = handle?.detach();

    expect(detached?.querySelector('span')?.textContent).toBe('keep');
    expect(outlet.children).toHaveLength(0);

    const handle2 = outlet.apply('<i>x</i>', { strategy: 'replace', key: '/y' });
    expect(handle2?.key).toBe('/y');
    handle2?.destroy();
    expect(handle2?.root.children).toHaveLength(0);
  });

  it('destroy and detach are idempotent', () => {
    const outlet = createOutlet();
    const handle = outlet.apply('<span>x</span>', { strategy: 'replace', key: '/x' });

    handle?.detach();
    handle?.detach();
    expect(outlet.children).toHaveLength(0);

    const handle2 = outlet.apply('<span>y</span>', { strategy: 'replace' });
    handle2?.destroy();
    handle2?.destroy();
    expect(handle2?.root.children).toHaveLength(0);
  });

  it('returns null when signal is aborted', () => {
    const outlet = createOutlet();
    const controller = new AbortController();
    controller.abort();
    expect(outlet.apply('<span>x</span>', { signal: controller.signal })).toBeNull();
    expect(outlet.apply('<span>x</span>', { strategy: 'patch', signal: controller.signal })).toBeNull();
    expect(outlet.apply('<span>x</span>', { strategy: 'stage', signal: controller.signal })).toBeNull();
  });

  it('apply patch returns null and leaves DOM unchanged when signal is aborted', () => {
    const outlet = createOutlet();
    outlet.apply('<span>old</span>', { strategy: 'replace', key: '/a' });

    const controller = new AbortController();
    controller.abort();
    const handle = outlet.apply('<span>new</span>', {
      strategy: 'patch',
      signal: controller.signal,
    });

    expect(handle).toBeNull();
    expect(outlet.querySelector('span')?.textContent).toBe('old');
    expect(outlet.querySelector('[data-aura-view-root]')?.getAttribute('data-aura-key')).toBe('/a');
  });

  it('disconnectedCallback clears outlet state', () => {
    const outlet = createOutlet();
    outlet.apply('<span>x</span>', { strategy: 'replace', key: '/x' });
    outlet.remove();
    document.body.append(outlet);

    const handle = outlet.apply('<span>y</span>', { strategy: 'patch' });
    expect(handle?.root.querySelector('span')?.textContent).toBe('y');
    expect(outlet.children).toHaveLength(1);
  });

  it('findNestedOutlet finds nested aura-outlet', () => {
    const outlet = createOutlet();
    const layoutRoot = document.createElement('div');
    const nested = document.createElement(AuraOutlet.is);
    layoutRoot.append(document.createElement('header'), nested);

    outlet.apply(layoutRoot, { strategy: 'replace', key: '/layout' });
    expect(outlet.findNestedOutlet()).toBe(nested);
  });

  describe('transitions', () => {
    it('detach active during stage promotes staged view', () => {
      const outlet = createOutlet();
      const oldRoot = createViewRoot();
      oldRoot.textContent = 'old';
      const oldHandle = outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

      const newRoot = createViewRoot();
      newRoot.textContent = 'new';
      outlet.apply(newRoot, { strategy: 'stage', key: '/b' });

      const detached = oldHandle?.detach();
      expect(detached).toBe(oldRoot);
      expect(outlet.children).toHaveLength(1);
      expect(outlet.textContent).toBe('new');

      const handle = outlet.apply('<i>ok</i>', { strategy: 'patch' });
      expect(handle?.root).toBe(newRoot);
      expect(newRoot.querySelector('i')?.textContent).toBe('ok');
    });

    it('destroy staged handle during stage keeps active view', () => {
      const outlet = createOutlet();
      const oldRoot = createViewRoot();
      oldRoot.textContent = 'old';
      outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

      const newRoot = createViewRoot();
      newRoot.textContent = 'new';
      const stagedHandle = outlet.apply(newRoot, { strategy: 'stage', key: '/b' });
      stagedHandle?.destroy();

      expect(outlet.children).toHaveLength(1);
      expect(outlet.textContent).toBe('old');
      expect(oldRoot.dataset.auraKey).toBe('/a');

      const handle = outlet.apply('<em>x</em>', { strategy: 'patch', key: '/a' });
      expect(handle?.root).toBe(oldRoot);
      expect(oldRoot.querySelector('em')?.textContent).toBe('x');
    });

    it('detach staged handle during stage keeps active view', () => {
      const outlet = createOutlet();
      const oldRoot = createViewRoot();
      oldRoot.textContent = 'old';
      outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

      const newRoot = createViewRoot();
      newRoot.textContent = 'new';
      const stagedHandle = outlet.apply(newRoot, { strategy: 'stage', key: '/b' });
      const detached = stagedHandle?.detach();

      expect(detached).toBe(newRoot);
      expect(outlet.children).toHaveLength(1);
      expect(outlet.textContent).toBe('old');
    });

    it('replace during stage drops staged view and mounts new root', () => {
      const outlet = createOutlet();
      outlet.apply(createViewRoot(), { strategy: 'replace', key: '/a' });
      const stagedRoot = createViewRoot();
      stagedRoot.textContent = 'staged';
      outlet.apply(stagedRoot, { strategy: 'stage', key: '/b' });

      const handle = outlet.apply('<b>final</b>', { strategy: 'replace', key: '/c' });
      expect(outlet.children).toHaveLength(1);
      expect(outlet.textContent).toBe('final');
      expect(handle?.key).toBe('/c');
    });

    it('patch during stage updates active root, not staged', () => {
      const outlet = createOutlet();
      const oldRoot = createViewRoot();
      oldRoot.textContent = 'old';
      outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

      const newRoot = createViewRoot();
      newRoot.textContent = 'new';
      outlet.apply(newRoot, { strategy: 'stage', key: '/b' });

      outlet.apply('<mark>patch</mark>', { strategy: 'patch' });
      expect(oldRoot.querySelector('mark')?.textContent).toBe('patch');
      expect(newRoot.textContent).toBe('new');
      expect(outlet.children).toHaveLength(2);
    });

    it('commitStage on active root removes staged sibling', () => {
      const outlet = createOutlet();
      const oldRoot = createViewRoot();
      oldRoot.textContent = 'old';
      outlet.apply(oldRoot, { strategy: 'replace', key: '/a' });

      const newRoot = createViewRoot();
      newRoot.textContent = 'new';
      outlet.apply(newRoot, { strategy: 'stage', key: '/b' });

      outlet.commitStage(oldRoot);
      expect(outlet.children).toHaveLength(1);
      expect(outlet.textContent).toBe('old');
      expect(oldRoot.dataset.auraKey).toBe('/a');
    });

    it('re-stage replaces previous staged root', () => {
      const outlet = createOutlet();
      const activeRoot = createViewRoot();
      activeRoot.textContent = 'active';
      outlet.apply(activeRoot, { strategy: 'replace', key: '/a' });

      const firstStaged = createViewRoot();
      firstStaged.textContent = 'first';
      outlet.apply(firstStaged, { strategy: 'stage', key: '/b' });

      const secondStaged = createViewRoot();
      secondStaged.textContent = 'second';
      outlet.apply(secondStaged, { strategy: 'stage', key: '/c' });

      expect(outlet.children).toHaveLength(2);
      expect(outlet.textContent).toBe('activesecond');
      expect(firstStaged.isConnected).toBe(false);
    });

    it('findNestedOutlet prefers staged layout during transition', () => {
      const outlet = createOutlet();
      const oldLayout = document.createElement('div');
      const oldNested = document.createElement(AuraOutlet.is);
      oldLayout.append(oldNested);
      outlet.apply(oldLayout, { strategy: 'replace', key: '/a' });

      const newLayout = document.createElement('div');
      const newNested = document.createElement(AuraOutlet.is);
      newLayout.append(newNested);
      outlet.apply(newLayout, { strategy: 'stage', key: '/b' });

      expect(outlet.findNestedOutlet()).toBe(newNested);
      expect(outlet.findNestedOutlet(oldLayout)).toBe(oldNested);
    });
  });
});

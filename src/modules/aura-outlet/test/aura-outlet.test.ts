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

  it('apply patch updates content in active root', () => {
    const outlet = createOutlet();
    outlet.apply('<span>old</span>', { strategy: 'replace', key: '/a' });
    const handle = outlet.apply('<span>new</span>', { strategy: 'patch', key: '/a' });

    expect(handle?.root.hasAttribute(AURA_VIEW_ROOT_ATTR)).toBe(true);
    expect(outlet.querySelector('span')?.textContent).toBe('new');
    expect(outlet.children).toHaveLength(1);
  });

  it('apply patch reuses active root; route change uses replace upstream', () => {
    const outlet = createOutlet();
    const first = outlet.apply('<span>a</span>', { strategy: 'replace', key: '/a' });
    const second = outlet.apply('<span>b</span>', { strategy: 'patch', key: '/b' });

    expect(second?.root).toBe(first?.root);
    expect(outlet.querySelector('span')?.textContent).toBe('b');
    expect(second?.key).toBe('/b');
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
    expect(outlet.textContent).toBe('new');
    oldHandle?.destroy();
    newHandle?.destroy();
  });

  it('destroy clears root children, detach preserves them', () => {
    const outlet = createOutlet();
    const handle = outlet.apply('<span>keep</span>', { strategy: 'replace', key: '/x' });
    const detached = handle?.detach();

    expect(detached?.querySelector('span')?.textContent).toBe('keep');
    expect(outlet.children).toHaveLength(0);

    const handle2 = outlet.apply('<i>x</i>', { strategy: 'replace', key: '/y' });
    handle2?.destroy();
    expect(handle2?.root.children).toHaveLength(0);
  });

  it('returns null when signal is aborted', () => {
    const outlet = createOutlet();
    const signal = new AbortController();
    signal.abort();
    expect(outlet.apply('<span>x</span>', { signal: signal.signal })).toBeNull();
  });

  it('findNestedOutlet finds nested aura-outlet', () => {
    const outlet = createOutlet();
    const layoutRoot = document.createElement('div');
    const nested = document.createElement(AuraOutlet.is);
    layoutRoot.append(document.createElement('header'), nested);

    outlet.apply(layoutRoot, { strategy: 'replace', key: '/layout' });
    expect(outlet.findNestedOutlet()).toBe(nested);
  });
});

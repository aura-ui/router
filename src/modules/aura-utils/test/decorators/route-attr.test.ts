import { attr, routeAttr } from '../../decorators';

let cachedParseCalls = 0;
function parseCachedLabel(value: string | null): string | null {
  cachedParseCalls++;
  return value;
}

class RouteAttrHost extends HTMLElement {
  @routeAttr({ parser: parseCachedLabel }) label: string | null;
}

class LocalOnlyHost extends HTMLElement {
  @routeAttr({ inherit: false, parser: parseCachedLabel }) label: string | null;
}

describe('@routeAttr', () => {
  const tag = 'route-attr-host';
  const localTag = 'route-attr-local-host';

  beforeAll(() => {
    if (!customElements.get(tag)) {
      customElements.define(tag, RouteAttrHost);
    }
    if (!customElements.get(localTag)) {
      customElements.define(localTag, LocalOnlyHost);
    }
  });

  beforeEach(() => {
    cachedParseCalls = 0;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('defaults to inherit and cached', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(tag) as RouteAttrHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('parent');
    expect(child.label).toBe('parent');
    expect(cachedParseCalls).toBe(1);

    root.setAttribute('label', 'changed');
    expect(child.label).toBe('parent');

    routeAttr.clear(child, 'label');
    expect(child.label).toBe('changed');
    expect(cachedParseCalls).toBe(2);
  });

  it('allows inherit: false override', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(localTag) as LocalOnlyHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBeNull();
    expect(cachedParseCalls).toBe(1);
  });

  it('routeAttr.clear aliases attr.clear', () => {
    expect(routeAttr.clear).toBe(attr.clear);
  });
});

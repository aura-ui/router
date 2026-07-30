import { isOffKeyword } from '../../../aura-route/core/attr/off-keyword';
import { attr, routeAttr } from '../../decorators';

let cachedParseCalls = 0;
function parseCachedLabel(value: string | null): string | null {
  cachedParseCalls++;
  return value;
}

function parseOffAwareLabel(value: string | null): string | null {
  if (value === null) return null;
  if (isOffKeyword(value)) return 'disabled';
  return parseCachedLabel(value);
}

class RouteAttrHost extends HTMLElement {
  @routeAttr({ parser: parseCachedLabel }) label: string | null;
}

class LocalOnlyHost extends HTMLElement {
  @routeAttr({ inherit: false, parser: parseCachedLabel }) label: string | null;
}

class RouteAttrOffHost extends HTMLElement {
  @routeAttr({ parser: parseOffAwareLabel }) label: string | null;
}

describe('@routeAttr', () => {
  const tag = 'route-attr-host';
  const localTag = 'route-attr-local-host';
  const offTag = 'route-attr-off-host';

  beforeAll(() => {
    if (!customElements.get(tag)) customElements.define(tag, RouteAttrHost);
    if (!customElements.get(localTag)) customElements.define(localTag, LocalOnlyHost);
    if (!customElements.get(offTag)) customElements.define(offTag, RouteAttrOffHost);
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
    expect(cachedParseCalls).toBe(1);

    routeAttr.clear(child, 'label');
    root.setAttribute('label', 'changed');
    expect(child.label).toBe('changed');
  });

  it('allows inherit: false override', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(localTag) as LocalOnlyHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBeNull();
  });

  it('parser handles off keywords via isOffKeyword', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    for (const value of ['none', 'off', 'false']) {
      const child = document.createElement(offTag) as RouteAttrOffHost;
      child.setAttribute('label', value);
      root.append(child);
      document.body.append(root);

      expect(child.label).toBe('disabled');
      child.remove();
    }
  });

  it('routeAttr.clear aliases attr.clear', () => {
    expect(routeAttr.clear).toBe(attr.clear);
  });
});

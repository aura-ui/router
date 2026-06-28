import { attr } from '../../decorators/attr';

class InheritHost extends HTMLElement {
  @attr({ inherit: true }) label: string | null;
}

class EmptyAllowedHost extends HTMLElement {
  @attr({ inherit: true, allowEmpty: true }) label: string | null;
}

let cachedParseCalls = 0;
function parseCachedLabel(value: string | null): string | null {
  cachedParseCalls++;
  return value;
}

class CachedHost extends HTMLElement {
  @attr({ cached: true, inherit: true, parser: parseCachedLabel }) label: string | null;
}

describe('@attr inherit', () => {
  const hostTag = 'inherit-host';
  const emptyTag = 'empty-allowed-host';
  const cachedTag = 'cached-attr-host';

  beforeAll(() => {
    if (!customElements.get(hostTag)) {
      customElements.define(hostTag, InheritHost);
    }
    if (!customElements.get(emptyTag)) {
      customElements.define(emptyTag, EmptyAllowedHost);
    }
    if (!customElements.get(cachedTag)) {
      customElements.define(cachedTag, CachedHost);
    }
  });

  beforeEach(() => {
    cachedParseCalls = 0;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits from parent when child has no attribute', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(hostTag) as InheritHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('parent');

    root.remove();
  });

  it('empty string without emptyAllowed still inherits from parent', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(hostTag) as InheritHost;
    child.setAttribute('label', '');
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('parent');

    root.remove();
  });

  it('allowEmpty: empty string on child blocks inheritance', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(emptyTag) as EmptyAllowedHost;
    child.setAttribute('label', '');
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('');

    root.remove();
  });

  it('allowEmpty: child override with non-empty value', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(emptyTag) as EmptyAllowedHost;
    child.setAttribute('label', 'child');
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('child');

    root.remove();
  });

  it('cached attr reparses when local attribute changes', () => {
    const child = document.createElement(cachedTag) as CachedHost;
    child.setAttribute('label', 'first');
    document.body.append(child);

    expect(child.label).toBe('first');
    expect(child.label).toBe('first');
    expect(cachedParseCalls).toBe(1);

    child.setAttribute('label', 'second');

    expect(child.label).toBe('second');
    expect(cachedParseCalls).toBe(2);
  });

  it('cached attr reparses when inherited attribute changes', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent-first');

    const child = document.createElement(cachedTag) as CachedHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('parent-first');
    expect(child.label).toBe('parent-first');
    expect(cachedParseCalls).toBe(1);

    root.setAttribute('label', 'parent-second');

    expect(child.label).toBe('parent-second');
    expect(cachedParseCalls).toBe(2);
  });
});

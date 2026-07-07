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

class DualCachedHost extends HTMLElement {
  @attr({ cached: true, parser: parseCachedLabel }) first: string | null;
  @attr({ cached: true, parser: parseCachedLabel }) second: string | null;
}

class CachedChildHost extends CachedHost {}

describe('@attr inherit', () => {
  const hostTag = 'inherit-host';
  const emptyTag = 'empty-allowed-host';
  const cachedTag = 'cached-attr-host';
  const dualCachedTag = 'dual-cached-attr-host';
  const cachedChildTag = 'cached-attr-child-host';

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
    if (!customElements.get(dualCachedTag)) {
      customElements.define(dualCachedTag, DualCachedHost);
    }
    if (!customElements.get(cachedChildTag)) {
      customElements.define(cachedChildTag, CachedChildHost);
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

  it('cached attr reads DOM once until cleared', () => {
    const child = document.createElement(cachedTag) as CachedHost;
    child.setAttribute('label', 'first');
    document.body.append(child);

    expect(child.label).toBe('first');
    expect(child.label).toBe('first');
    expect(cachedParseCalls).toBe(1);

    child.setAttribute('label', 'second');

    expect(child.label).toBe('first');
    expect(cachedParseCalls).toBe(1);

    attr.clear(child, 'label');

    expect(child.label).toBe('second');
    expect(cachedParseCalls).toBe(2);
  });

  it('cached attr keeps inherited value until cleared', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent-first');

    const child = document.createElement(cachedTag) as CachedHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('parent-first');
    expect(child.label).toBe('parent-first');
    expect(cachedParseCalls).toBe(1);

    root.setAttribute('label', 'parent-second');

    expect(child.label).toBe('parent-first');
    expect(cachedParseCalls).toBe(1);

    attr.clear(child, 'label');

    expect(child.label).toBe('parent-second');
    expect(cachedParseCalls).toBe(2);
  });

  it('cached attr is stored per element instance and per property', () => {
    const first = document.createElement(dualCachedTag) as DualCachedHost;
    const second = document.createElement(dualCachedTag) as DualCachedHost;
    first.setAttribute('first', 'a');
    first.setAttribute('second', 'b');
    second.setAttribute('first', 'c');
    second.setAttribute('second', 'd');
    document.body.append(first, second);

    expect(first.first).toBe('a');
    expect(first.second).toBe('b');
    expect(second.first).toBe('c');
    expect(second.second).toBe('d');
    expect(cachedParseCalls).toBe(4);

    first.setAttribute('first', 'changed');
    second.setAttribute('second', 'changed');

    expect(first.first).toBe('a');
    expect(second.second).toBe('d');
    expect(cachedParseCalls).toBe(4);

    attr.clear(first, 'first');
    attr.clear(second, 'second');

    expect(first.first).toBe('changed');
    expect(second.second).toBe('changed');
    expect(cachedParseCalls).toBe(6);
  });

  it('attr.clear without prop drops every cached property on the instance', () => {
    const host = document.createElement(dualCachedTag) as DualCachedHost;
    host.setAttribute('first', 'a');
    host.setAttribute('second', 'b');
    document.body.append(host);

    expect(host.first).toBe('a');
    expect(host.second).toBe('b');
    expect(cachedParseCalls).toBe(2);

    attr.clear(host);

    host.setAttribute('first', 'x');
    host.setAttribute('second', 'y');

    expect(host.first).toBe('x');
    expect(host.second).toBe('y');
    expect(cachedParseCalls).toBe(4);
  });

  it('attr.clear works on a subclass instance', () => {
    const child = document.createElement(cachedChildTag) as CachedChildHost;
    child.setAttribute('label', 'first');
    document.body.append(child);

    expect(child.label).toBe('first');
    expect(cachedParseCalls).toBe(1);

    child.setAttribute('label', 'second');
    expect(child.label).toBe('first');

    attr.clear(child, 'label');

    expect(child.label).toBe('second');
    expect(cachedParseCalls).toBe(2);
  });
});

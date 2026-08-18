import { attr } from '../../decorators/attr';

class InheritHost extends HTMLElement {
  @attr({ inherit: true }) label: string | null;
}

class AliasInheritHost extends HTMLElement {
  @attr({ inherit: 'parent-label' }) label: string | null;
}

class WritableHost extends HTMLElement {
  @attr() label: string | null;
}

class ReadonlyHost extends HTMLElement {
  @attr({ readonly: true }) label: string | null;
}

class DefaultHost extends HTMLElement {
  @attr({ defaultValue: 'fallback' }) label: string | null;
}

class DataHost extends HTMLElement {
  @attr({ dataAttr: true }) myFlag: string | null;
}

let cachedParseCalls = 0;
function parseCachedLabel(value: string | null): string | null {
  cachedParseCalls++;
  return value;
}

class CachedHost extends HTMLElement {
  @attr({ cached: true, inherit: true, parser: parseCachedLabel }) label: string | null;
}

class WritableCachedHost extends HTMLElement {
  @attr({ cached: true, parser: parseCachedLabel }) label: string | null;
}

class DualCachedHost extends HTMLElement {
  @attr({ cached: true, parser: parseCachedLabel }) first: string | null;
  @attr({ cached: true, parser: parseCachedLabel }) second: string | null;
}

class CachedChildHost extends CachedHost {}

describe('@attr', () => {
  const hostTag = 'inherit-host';
  const aliasTag = 'alias-inherit-host';
  const writableTag = 'writable-attr-host';
  const readonlyTag = 'readonly-attr-host';
  const defaultTag = 'default-attr-host';
  const dataTag = 'data-attr-host';
  const cachedTag = 'cached-attr-host';
  const writableCachedTag = 'writable-cached-attr-host';
  const dualCachedTag = 'dual-cached-attr-host';
  const cachedChildTag = 'cached-attr-child-host';

  beforeAll(() => {
    for (const [tag, ctor] of [
      [hostTag, InheritHost],
      [aliasTag, AliasInheritHost],
      [writableTag, WritableHost],
      [readonlyTag, ReadonlyHost],
      [defaultTag, DefaultHost],
      [dataTag, DataHost],
      [cachedTag, CachedHost],
      [writableCachedTag, WritableCachedHost],
      [dualCachedTag, DualCachedHost],
      [cachedChildTag, CachedChildHost],
    ] as const) {
      if (!customElements.get(tag)) customElements.define(tag, ctor);
    }
  });

  beforeEach(() => {
    cachedParseCalls = 0;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits from parent when local attribute is absent', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(hostTag) as InheritHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('parent');
  });

  it('uses local attribute when present', () => {
    const root = document.createElement('div');
    root.setAttribute('label', 'parent');

    const child = document.createElement(hostTag) as InheritHost;
    child.setAttribute('label', 'child');
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('child');
  });

  it('inheritFrom limits lookup to host tag', () => {
    class ScopedHost extends HTMLElement {
      @attr({ inherit: true, inheritFrom: 'scoped-root' }) label: string | null;
    }
    const scopedTag = 'scoped-inherit-host';
    if (!customElements.get(scopedTag)) customElements.define(scopedTag, ScopedHost);
    if (!customElements.get('scoped-root')) {
      customElements.define('scoped-root', class extends HTMLElement {});
    }

    const skipped = document.createElement('div');
    skipped.setAttribute('label', 'skipped');
    const host = document.createElement('scoped-root');
    host.setAttribute('label', 'from-host');
    const child = document.createElement(scopedTag) as ScopedHost;
    skipped.append(host);
    host.append(child);
    document.body.append(skipped);

    expect(child.label).toBe('from-host');
  });

  it('uses custom inherit attribute name', () => {
    const root = document.createElement('div');
    root.setAttribute('parent-label', 'from-parent');

    const child = document.createElement(aliasTag) as AliasInheritHost;
    root.append(child);
    document.body.append(root);

    expect(child.label).toBe('from-parent');
  });

  it('inherit reads empty when not connected', () => {
    const child = document.createElement(hostTag) as InheritHost;
    expect(child.label).toBe('');
  });

  it('sets and removes attribute on assignment', () => {
    const host = document.createElement(writableTag) as WritableHost;
    document.body.append(host);

    host.label = 'child';
    expect(host.getAttribute('label')).toBe('child');

    host.label = null;
    expect(host.hasAttribute('label')).toBe(false);
  });

  it('uses defaultValue when attribute is absent', () => {
    const host = document.createElement(defaultTag) as DefaultHost;
    document.body.append(host);

    expect(host.label).toBe('fallback');
  });

  it('readonly attr exposes getter only', () => {
    const host = document.createElement(readonlyTag) as ReadonlyHost;
    host.setAttribute('label', 'fixed');
    document.body.append(host);

    expect(host.label).toBe('fixed');
    expect(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(host), 'label')?.set).toBeUndefined();
  });

  it('maps dataAttr to data-* name', () => {
    const host = document.createElement(dataTag) as DataHost;
    host.setAttribute('data-my-flag', 'on');
    document.body.append(host);

    expect(host.myFlag).toBe('on');
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

  it('cached inherit ignores ancestor changes until cleared', () => {
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

  it('cached assignment refreshes DOM and cache', () => {
    const host = document.createElement(writableCachedTag) as WritableCachedHost;
    document.body.append(host);

    host.label = 'second';
    expect(host.getAttribute('label')).toBe('second');
    expect(host.label).toBe('second');
    expect(cachedParseCalls).toBe(1);

    host.setAttribute('label', 'first');
    expect(host.label).toBe('second');
    expect(cachedParseCalls).toBe(1);

    attr.clear(host, 'label');
    expect(host.label).toBe('first');
    expect(cachedParseCalls).toBe(2);
  });

  it('cached attrs are isolated per element and property', () => {
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

  it('attr.clear() clears all cached properties', () => {
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

  it('attr.clear accepts a property list', () => {
    const host = document.createElement(dualCachedTag) as DualCachedHost;
    host.setAttribute('first', 'a');
    host.setAttribute('second', 'b');
    document.body.append(host);

    expect(host.first).toBe('a');
    expect(host.second).toBe('b');
    expect(cachedParseCalls).toBe(2);

    host.setAttribute('first', 'x');
    host.setAttribute('second', 'y');

    attr.clear(host, ['first', 'second']);

    expect(host.first).toBe('x');
    expect(host.second).toBe('y');
    expect(cachedParseCalls).toBe(4);
  });

  it('attr.clear ignores class constructor', () => {
    expect(() => attr.clear(InheritHost as unknown as object)).not.toThrow();
  });

  it('attr.clear no-ops when cache is absent', () => {
    const host = document.createElement(cachedTag) as CachedHost;
    expect(() => attr.clear(host, 'label')).not.toThrow();
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

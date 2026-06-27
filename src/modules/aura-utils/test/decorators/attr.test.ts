import { attr } from '../../decorators/attr';

class InheritHost extends HTMLElement {
  @attr({ inherit: true }) label: string | null;
}

class EmptyAllowedHost extends HTMLElement {
  @attr({ inherit: true, allowEmpty: true }) label: string | null;
}

describe('@attr inherit', () => {
  const hostTag = 'inherit-host';
  const emptyTag = 'empty-allowed-host';

  beforeAll(() => {
    if (!customElements.get(hostTag)) {
      customElements.define(hostTag, InheritHost);
    }
    if (!customElements.get(emptyTag)) {
      customElements.define(emptyTag, EmptyAllowedHost);
    }
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
});

import { replaceInner, updateInner } from '../core/patch';

describe('aura-dom/patch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('replaceInner replaces children from string', () => {
    container.append(document.createElement('span'));
    replaceInner(container, '<p>hello</p>');
    expect(container.querySelector('p')?.textContent).toBe('hello');
    expect(container.children).toHaveLength(1);
  });

  it('replaceInner replaces children from DocumentFragment', () => {
    const fragment = document.createDocumentFragment();
    const span = document.createElement('span');
    span.textContent = 'frag';
    fragment.append(span);
    replaceInner(container, fragment);
    expect(container.textContent).toBe('frag');
  });

  it('updateInner replaces children', () => {
    updateInner(container, '<i>x</i>');
    expect(container.querySelector('i')?.textContent).toBe('x');
  });

  it('updateInner skips work when signal is aborted', () => {
    const signal = new AbortController();
    signal.abort();
    const result = updateInner(container, '<b>nope</b>', { signal: signal.signal });
    expect(result.incremental).toBe(false);
    expect(container.children).toHaveLength(0);
  });
});

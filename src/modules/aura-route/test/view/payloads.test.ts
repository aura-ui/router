import { resolveError } from '../../core/view/payloads';

describe('payloads', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolveError uses errorTemplate when present', () => {
    const template = document.createElement('template');
    template.id = 'route-error-tpl';
    template.innerHTML = '<p>Oops</p>';
    document.body.append(template);

    const payload = resolveError(
      { path: '/err', errorTemplate: 'route-error-tpl' } as never,
      new Error('fail'),
    );

    expect(payload).toBeInstanceOf(DocumentFragment);
    expect((payload as DocumentFragment).firstChild?.textContent).toBe('Oops');
  });

  it('resolveError falls back to HTML error panel', () => {
    const payload = resolveError({ path: '/err', errorTemplate: '' } as never, new Error('boom'));

    expect(typeof payload).toBe('string');
    expect(payload).toContain('Content Loading Error');
    expect(payload).toContain('boom');
  });
});

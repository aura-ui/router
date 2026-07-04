/** @jest-environment jsdom */

describe('HTML parsing of view attribute', () => {
  it('preserves inline html in single-quoted view', () => {
    document.body.innerHTML = `
      <div id="probe" path="/a" view='html:<a href="/c" data-router-link>load template</a>' guard="auth"></div>
    `;
    const el = document.getElementById('probe')!;
    expect(el.getAttribute('view')).toBe('html:<a href="/c" data-router-link>load template</a>');
    expect(el.getAttribute('guard')).toBe('auth');
  });

  it('decodes entity-encoded markup inside view', () => {
    document.body.innerHTML = `
      <div id="probe" view='html:&lt;div class="t-page"&gt;Home&lt;/div&gt;'></div>
    `;
    const el = document.getElementById('probe')!;
    expect(el.getAttribute('view')).toBe('html:<div class="t-page">Home</div>');
  });
});

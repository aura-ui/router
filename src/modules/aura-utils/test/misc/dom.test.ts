import { applyHtmlExtract, extractHtmlFragment } from '../../misc/dom';

const FULL_PAGE = `<!DOCTYPE html>
<html>
  <head><title>Legacy</title></head>
  <body>
    <nav>Menu</nav>
    <main id="content"><h1>About</h1><p>Body</p></main>
  </body>
</html>`;

describe('extractHtmlFragment', () => {
  it('returns outerHTML of the matched element', () => {
    expect(extractHtmlFragment(FULL_PAGE, '#content')).toBe(
      '<main id="content"><h1>About</h1><p>Body</p></main>',
    );
  });

  it('supports compound selectors via querySelector', () => {
    expect(extractHtmlFragment(FULL_PAGE, 'main#content')).toBe(
      '<main id="content"><h1>About</h1><p>Body</p></main>',
    );
  });

  it('returns null when selector matches nothing', () => {
    expect(extractHtmlFragment(FULL_PAGE, '#missing')).toBeNull();
  });

  it('works on partial html (no full document)', () => {
    expect(extractHtmlFragment('<section class="main"><p>x</p></section>', '.main')).toBe(
      '<section class="main"><p>x</p></section>',
    );
  });
});

describe('applyHtmlExtract', () => {
  it('returns fragment when selector matches', () => {
    expect(applyHtmlExtract(FULL_PAGE, '#content', '/about')).toBe(
      '<main id="content"><h1>About</h1><p>Body</p></main>',
    );
  });

  it('returns html unchanged when extract is absent', () => {
    expect(applyHtmlExtract('<p>x</p>', null, '/x')).toBe('<p>x</p>');
    expect(applyHtmlExtract('<p>x</p>', undefined, '/x')).toBe('<p>x</p>');
  });

  it('warns and returns full html when selector matches nothing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const html = '<div id="root">full</div>';

    expect(applyHtmlExtract(html, '#missing', '/page')).toBe(html);
    expect(warn).toHaveBeenCalledWith(
      'Nothing found for extract selector "#missing" — using full HTML. Page — /page',
    );

    warn.mockRestore();
  });
});

import { extractHtmlFragment } from '../../misc/dom';

const FULL_PAGE = `<!DOCTYPE html>
<html>
  <head><title>Legacy</title></head>
  <body>
    <nav>Menu</nav>
    <main id="content"><h1>About</h1><p>Body</p></main>
  </body>
</html>`;

describe('extractHtmlFragment', () => {
  it('returns innerHTML of the matched element', () => {
    expect(extractHtmlFragment(FULL_PAGE, '#content')).toBe(
      '<h1>About</h1><p>Body</p>',
    );
  });

  it('supports compound selectors via querySelector', () => {
    expect(extractHtmlFragment(FULL_PAGE, 'main#content')).toBe(
      '<h1>About</h1><p>Body</p>',
    );
  });

  it('throws when selector matches nothing', () => {
    expect(() => extractHtmlFragment(FULL_PAGE, '#missing')).toThrow(
      'No element matches selector "#missing"',
    );
  });
});

import { parseViewAttr } from '../../core/attr/view-attr-parser';

describe('parseViewAttr', () => {
  it('splits known loader prefix on the first ::', () => {
    expect(parseViewAttr('url::profile.html')).toEqual({
      loader: 'url',
      content: 'profile.html',
    });
    expect(parseViewAttr('import::./pages/profile.ts')).toEqual({
      loader: 'import',
      content: './pages/profile.ts',
    });
    expect(parseViewAttr('component::user-card')).toEqual({
      loader: 'component',
      content: 'user-card',
    });
    expect(parseViewAttr('custom::my-loader')).toEqual({
      loader: 'custom',
      content: 'my-loader',
    });
  });

  it('preserves single colons in content', () => {
    expect(parseViewAttr('html::<div data-x="a:b">x</div>')).toEqual({
      loader: 'html',
      content: '<div data-x="a:b">x</div>',
    });
  });

  it('defaults bare content to url', () => {
    expect(parseViewAttr('profile.html')).toEqual({
      loader: 'url',
      content: 'profile.html',
    });
    expect(parseViewAttr('pages/home.html')).toEqual({
      loader: 'url',
      content: 'pages/home.html',
    });
  });

  it('treats unknown prefix before :: as custom loader', () => {
    expect(parseViewAttr('markdown::docs/guide.md')).toEqual({
      loader: 'markdown',
      content: 'docs/guide.md',
    });
  });

  it('returns null for empty values', () => {
    expect(parseViewAttr('')).toBeNull();
    expect(parseViewAttr('   ')).toBeNull();
  });

  it('treats leading :: as bare url content', () => {
    expect(parseViewAttr('::content-only')).toEqual({
      loader: 'url',
      content: '::content-only',
    });
  });

  it('treats single-colon strings as bare url content', () => {
    expect(parseViewAttr('page:profile.html')).toEqual({
      loader: 'url',
      content: 'page:profile.html',
    });
  });

  it('warns when bare url content looks like a module path', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    parseViewAttr('./pages/app.ts');
    parseViewAttr('./pages/app.ts');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'view content "./pages/app.ts" looks like a module path — use import::./pages/app.ts instead of url',
    );
    warn.mockRestore();
  });

  it('warns when component ref has no hyphen', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    parseViewAttr('component::div');

    expect(warn).toHaveBeenCalledWith('view="component::div" — custom element ref must contain "-"');
    warn.mockRestore();
  });

  it('does not warn for hyphenated component refs', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    parseViewAttr('component::user-card');

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

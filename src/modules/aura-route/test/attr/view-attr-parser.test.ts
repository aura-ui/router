import { parseViewAttr } from '../../core/attr/view-attr-parser';

describe('parseViewAttr', () => {
  it('splits known loader prefix on the first ::', () => {
    expect(parseViewAttr('url::profile.html')).toEqual({
      type: 'url',
      content: 'profile.html',
    });
    expect(parseViewAttr('import::./pages/profile.ts')).toEqual({
      type: 'import',
      content: './pages/profile.ts',
    });
    expect(parseViewAttr('component::user-card')).toEqual({
      type: 'component',
      content: 'user-card',
    });
    expect(parseViewAttr('custom::my-loader')).toEqual({
      type: 'custom',
      content: 'my-loader',
    });
  });

  it('preserves single colons in content', () => {
    expect(parseViewAttr('html::<div data-x="a:b">x</div>')).toEqual({
      type: 'html',
      content: '<div data-x="a:b">x</div>',
    });
  });

  it('defaults bare ref to url', () => {
    expect(parseViewAttr('profile.html')).toEqual({
      type: 'url',
      content: 'profile.html',
    });
    expect(parseViewAttr('pages/home.html')).toEqual({
      type: 'url',
      content: 'pages/home.html',
    });
  });

  it('treats unknown prefix before :: as custom loader', () => {
    expect(parseViewAttr('markdown::docs/guide.md')).toEqual({
      type: 'markdown',
      content: 'docs/guide.md',
    });
  });

  it('returns null for empty values', () => {
    expect(parseViewAttr('')).toBeNull();
    expect(parseViewAttr('   ')).toBeNull();
  });

  it('treats leading :: as bare url ref', () => {
    expect(parseViewAttr('::ref-only')).toEqual({
      type: 'url',
      content: '::ref-only',
    });
  });

  it('treats single-colon strings as bare url refs', () => {
    expect(parseViewAttr('page:profile.html')).toEqual({
      type: 'url',
      content: 'page:profile.html',
    });
  });

  it('warns when bare url ref looks like a module path', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    parseViewAttr('./pages/app.ts');
    parseViewAttr('./pages/app.ts');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'view ref "./pages/app.ts" looks like a module path — use import::./pages/app.ts instead of url',
    );
    warn.mockRestore();
  });
});

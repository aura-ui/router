import { parseViewAttr } from '../../core/attr/view-attr-parser';

describe('parseViewAttr', () => {
  it('splits type and content on the first ::', () => {
    expect(parseViewAttr('html-src::profile.html')).toEqual({
      type: 'html-src',
      content: 'profile.html',
    });
    expect(parseViewAttr('component::./pages/profile.ts')).toEqual({
      type: 'component',
      content: './pages/profile.ts',
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

  it('defaults bare ref to html-src', () => {
    expect(parseViewAttr('profile.html')).toEqual({
      type: 'html-src',
      content: 'profile.html',
    });
    expect(parseViewAttr('pages/home.html')).toEqual({
      type: 'html-src',
      content: 'pages/home.html',
    });
  });

  it('returns null for empty values', () => {
    expect(parseViewAttr('')).toBeNull();
    expect(parseViewAttr('   ')).toBeNull();
  });

  it('treats leading :: as bare html-src ref', () => {
    expect(parseViewAttr('::ref-only')).toEqual({
      type: 'html-src',
      content: '::ref-only',
    });
  });

  it('treats single-colon strings as bare html-src refs', () => {
    expect(parseViewAttr('html-src:profile.html')).toEqual({
      type: 'html-src',
      content: 'html-src:profile.html',
    });
  });
});

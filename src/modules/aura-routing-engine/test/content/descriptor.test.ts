import {
  buildContentDescriptor,
  isLoadableDescriptor,
  parseViewDescriptor,
} from '../../core/content';
import { NO_PRESERVE } from '../../core/content';

describe('parseViewDescriptor', () => {
  it('splits loader and ref on the first ::', () => {
    expect(parseViewDescriptor('html-src::profile.html')).toEqual({
      loader: 'html-src',
      ref: 'profile.html',
    });
    expect(parseViewDescriptor('component::./pages/profile.ts')).toEqual({
      loader: 'component',
      ref: './pages/profile.ts',
    });
    expect(parseViewDescriptor('custom::my-loader')).toEqual({
      loader: 'custom',
      ref: 'my-loader',
    });
  });

  it('preserves single colons in ref', () => {
    expect(parseViewDescriptor('html::<div data-x="a:b">x</div>')).toEqual({
      loader: 'html',
      ref: '<div data-x="a:b">x</div>',
    });
  });

  it('returns null for empty or invalid values', () => {
    expect(parseViewDescriptor('')).toBeNull();
    expect(parseViewDescriptor('   ')).toBeNull();
    expect(parseViewDescriptor('profile.html')).toBeNull();
    expect(parseViewDescriptor('html-src:profile.html')).toBeNull();
    expect(parseViewDescriptor('::ref-only')).toBeNull();
  });
});

describe('buildContentDescriptor', () => {
  const base = {
    layout: '',
    view: '',
    preserve: NO_PRESERVE,
  };

  it('maps layout to template descriptor', () => {
    expect(buildContentDescriptor({ ...base, layout: 'users-shell' })).toEqual({
      kind: 'layout',
      loader: 'template',
      ref: 'users-shell',
      cache: false,
    });
  });

  it('maps view="loader::ref" to content descriptor', () => {
    expect(
      buildContentDescriptor({ ...base, view: 'html-src::profile.html' }),
    ).toEqual({
      kind: 'content',
      loader: 'html-src',
      ref: 'profile.html',
      cache: false,
    });

    expect(
      buildContentDescriptor({
        ...base,
        view: 'component::profile-page',
        preserve: { view: false, data: true },
      }),
    ).toEqual({
      kind: 'content',
      loader: 'component',
      ref: 'profile-page',
      cache: true,
    });
  });

  it('returns empty loader when view is absent or invalid', () => {
    expect(buildContentDescriptor(base)).toEqual({
      kind: 'content',
      loader: '',
      ref: '',
      cache: false,
    });

    expect(buildContentDescriptor({ ...base, view: 'no-separator' })).toEqual({
      kind: 'content',
      loader: '',
      ref: '',
      cache: false,
    });
  });

  it('layout takes precedence over view', () => {
    expect(
      buildContentDescriptor({ ...base, layout: 'shell', view: 'html-src::ignored.html' }),
    ).toEqual({
      kind: 'layout',
      loader: 'template',
      ref: 'shell',
      cache: false,
    });
  });
});

describe('isLoadableDescriptor', () => {
  it('returns false for content routes without a loader', () => {
    expect(
      isLoadableDescriptor({ kind: 'content', loader: '', ref: '', cache: false }),
    ).toBe(false);
    expect(
      isLoadableDescriptor({ kind: 'content', loader: '  ', ref: 'x', cache: false }),
    ).toBe(false);
  });

  it('returns true for layout routes and content routes with a loader', () => {
    expect(
      isLoadableDescriptor({ kind: 'layout', loader: 'template', ref: 'shell', cache: false }),
    ).toBe(true);
    expect(
      isLoadableDescriptor({ kind: 'content', loader: 'html', ref: '<p>x</p>', cache: false }),
    ).toBe(true);
  });
});

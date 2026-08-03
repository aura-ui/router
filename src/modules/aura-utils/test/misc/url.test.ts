import {
  decodeURIFast,
  joinAppHref,
  splitAppHref,
  stripTrailingSlash,
} from '../../misc/url';

describe('url helpers (generic)', () => {
  describe('joinAppHref', () => {
    it('joins pathname, search, and hash', () => {
      expect(
        joinAppHref({ pathname: '/app/users', search: '?q=1', hash: '#tab' }),
      ).toBe('/app/users?q=1#tab');
    });
  });

  describe('splitAppHref', () => {
    it('splits pathname, search, and hash', () => {
      expect(splitAppHref('/app/users?q=1#tab')).toEqual({
        pathname: '/app/users',
        search: '?q=1',
        hash: '#tab',
      });
    });

    it('splits root hash-only href', () => {
      expect(splitAppHref('/#hash')).toEqual({
        pathname: '/',
        search: '',
        hash: '#hash',
      });
    });

    it('splits root search-only href', () => {
      expect(splitAppHref('/?q=1')).toEqual({
        pathname: '/',
        search: '?q=1',
        hash: '',
      });
    });

    it('treats # after search as hash, not part of query value', () => {
      expect(splitAppHref('/path?q=#not-a-hash')).toEqual({
        pathname: '/path',
        search: '?q=',
        hash: '#not-a-hash',
      });
    });

    it('preserves trailing slash on pathname', () => {
      expect(splitAppHref('/app/settings/')).toEqual({
        pathname: '/app/settings/',
        search: '',
        hash: '',
      });
    });

    it('falls back to URL for protocol-relative href', () => {
      expect(splitAppHref('//cdn.example.com/asset')).toEqual({
        pathname: '/asset',
        search: '',
        hash: '',
      });
    });

    it('decodes percent-encoded pathname at the boundary', () => {
      expect(splitAppHref('/%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D0%B0%D1%8F.html')).toEqual({
        pathname: '/главная.html',
        search: '',
        hash: '',
      });
    });
  });

  describe('decodeURIFast', () => {
    it('decodes UTF-8 percent-encoded pathnames', () => {
      expect(
        decodeURIFast(
          '/%D0%B0%D0%B2%D1%82%D0%BE%D1%80%D1%81%D0%BA%D0%B8%D0%B5-%D0%BF%D1%80%D0%B0%D0%B2%D0%B0.html',
        ),
      ).toBe('/авторские-права.html');
    });

    it('leaves already-decoded and ASCII paths unchanged', () => {
      expect(decodeURIFast('/авторские-права.html')).toBe('/авторские-права.html');
      expect(decodeURIFast('/about')).toBe('/about');
    });

    it('keeps %2F encoded so it cannot become a path separator', () => {
      expect(decodeURIFast('/a%2Fb')).toBe('/a%2Fb');
    });
  });

  describe('stripTrailingSlash', () => {
    it('strips trailing slash except root', () => {
      expect(stripTrailingSlash('/app/settings/')).toBe('/app/settings');
      expect(stripTrailingSlash('/')).toBe('/');
    });
  });
});

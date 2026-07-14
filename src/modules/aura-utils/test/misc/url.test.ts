import { joinAppHref, splitAppHref, stripTrailingSlash } from '../../misc/url';

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

    it('normalizes trailing slash on pathname', () => {
      expect(splitAppHref('/app/settings/')).toEqual({
        pathname: '/app/settings',
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
  });

  describe('stripTrailingSlash', () => {
    it('strips trailing slash except root', () => {
      expect(stripTrailingSlash('/app/settings/')).toBe('/app/settings');
      expect(stripTrailingSlash('/')).toBe('/');
    });
  });
});

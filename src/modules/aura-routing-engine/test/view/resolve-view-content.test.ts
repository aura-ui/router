import { resolveViewContent } from '../../core/route-tree/resolve-view-content';

describe('resolveViewContent', () => {
  describe('path tokens', () => {
    it('substitutes from params ∪ query (params win)', () => {
      expect(
        resolveViewContent('users/:id.html', {
          params: { id: '1' },
          query: { id: 'from-query' },
        }),
      ).toBe('users/1.html');
      expect(resolveViewContent(':lang/page.html', { query: { lang: 'ru' } })).toBe('ru/page.html');
      expect(resolveViewContent(':lang/page.html', { params: { id: '1' } })).toBe(':lang/page.html');
    });
  });

  describe('?* inherit', () => {
    it('appends raw search; empty or bare ? drops search', () => {
      expect(
        resolveViewContent('/item.html?*', { search: '?id=1&tag=books' }),
      ).toBe('/item.html?id=1&tag=books');
      expect(resolveViewContent('/users/:id?*', { params: { id: '42' }, search: '' })).toBe(
        '/users/42',
      );
      expect(resolveViewContent('/users/:id?*', { params: { id: '42' }, search: '?' })).toBe(
        '/users/42',
      );
    });
  });

  describe('allowlist', () => {
    it('builds key=:token pairs, remaps, encodes, omits missing/empty/non-tokens', () => {
      expect(
        resolveViewContent('/item.html?id=:id&tag=:tag', {
          query: { id: 'hello world', tag: 'books', utm: 'x' },
        }),
      ).toBe('/item.html?id=hello%20world&tag=books');

      expect(
        resolveViewContent('/api/item?itemId=:id', { query: { id: 'abc' } }),
      ).toBe('/api/item?itemId=abc');

      expect(
        resolveViewContent('/page.html?id=:id&tag=:tag', { query: { id: '1' } }),
      ).toBe('/page.html?id=1');
      expect(resolveViewContent('/page.html?id=:id', { query: { id: '' } })).toBe('/page.html');

      expect(
        resolveViewContent('/page.html?id=:id&x=fixed&*', { query: { id: '1' } }),
      ).toBe('/page.html?id=1');
    });

    it('resolves path tokens and allowlist together', () => {
      expect(
        resolveViewContent('/users/:id?tab=:tab', {
          params: { id: '7' },
          query: { tab: 'profile' },
        }),
      ).toBe('/users/7?tab=profile');
    });
  });
});

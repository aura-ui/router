import {
  AuraRoutingUrlMatcher,
  CATCH_ALL_SEGMENT,
  computeMatchScore,
  isCatchAllRoutePattern,
  isParamRoutePattern,
  isStaticRoutePattern,
} from '../../core/match/url-matcher';
import { resolveDocumentHrefParts } from '../../core/link-active/app-href';
import { buildRouteTree } from '../../core/route-tree/build-route-tree';
import { createDomRoute, collectRoutesFromDom } from '../_helpers/test-route-dom';

describe('AuraRoutingUrlMatcher', () => {
  const matcher = new AuraRoutingUrlMatcher();

  afterEach(() => {
    matcher.destroy();
  });

  describe('getPathParams', () => {
    it('global catch-all strips a leading slash from splat', () => {
      expect(matcher.getPathParams('/missing/page', '*')).toEqual({ splat: 'missing/page' });
    });

    it('global catch-all keeps pathname as splat when it has no leading slash', () => {
      expect(matcher.getPathParams('missing', '*')).toEqual({ splat: 'missing' });
    });

    it('scoped catch-all returns the tail after the prefix', () => {
      expect(matcher.getPathParams('/users/unknown', '/users/*')).toEqual({ splat: 'unknown' });
    });

    it('scoped catch-all rejects empty splat and off-prefix paths', () => {
      expect(matcher.getPathParams('/users/', '/users/*')).toBeNull();
      expect(matcher.getPathParams('/other/x', '/users/*')).toBeNull();
    });

    it('static patterns use exact equality', () => {
      expect(matcher.getPathParams('/about', '/about')).toEqual({});
      expect(matcher.getPathParams('/about', '/other')).toBeNull();
    });

    it('param patterns extract groups via URLPattern', () => {
      expect(matcher.getPathParams('/users/42', '/users/:id')).toEqual({ id: '42' });
      expect(matcher.getPathParams('/users', '/users/:id')).toBeNull();
    });

    it('skips undefined URLPattern groups', () => {
      const Orig = globalThis.URLPattern;
      class FakeURLPattern {
        exec() {
          return { pathname: { groups: { id: '1', optional: undefined } } };
        }
      }
      (globalThis as { URLPattern: typeof URLPattern }).URLPattern =
        FakeURLPattern as unknown as typeof URLPattern;

      try {
        const local = new AuraRoutingUrlMatcher();
        expect(local.getPathParams('/x', '/x/:id')).toEqual({ id: '1' });
        local.destroy();
      } finally {
        (globalThis as { URLPattern: typeof URLPattern }).URLPattern = Orig;
      }
    });

    it('falls back to static equality when URLPattern throws', () => {
      const Orig = globalThis.URLPattern;
      (globalThis as { URLPattern: typeof URLPattern }).URLPattern = class {
        constructor() {
          throw new Error('compile failed');
        }
      } as unknown as typeof URLPattern;

      try {
        const local = new AuraRoutingUrlMatcher();
        // Param patterns reach getUrlPatternParams; catch compares pathname === pattern.
        expect(local.getPathParams('/:id', '/:id')).toEqual({});
        expect(local.getPathParams('/users/1', '/users/:id')).toBeNull();
        local.destroy();
      } finally {
        (globalThis as { URLPattern: typeof URLPattern }).URLPattern = Orig;
      }
    });
  });

  describe('matchPath', () => {
    it('returns null when nothing matches', () => {
      const { matchableNodes } = buildRouteTree(collectRoutesFromDom(createDomRoute('/about')));
      expect(matcher.matchPath('/other', matchableNodes)).toBeNull();
    });

    it('selects the deepest static matchable node', () => {
      const profile = createDomRoute('profile');
      const settings = createDomRoute('/settings', [profile]);
      const { matchableNodes } = buildRouteTree(collectRoutesFromDom(createDomRoute('/'), settings));

      expect(matcher.matchPath('/settings', matchableNodes)?.node.pattern).toBe('/settings');
      expect(matcher.matchPath('/settings/profile', matchableNodes)?.node.pattern).toBe(
        '/settings/profile',
      );
    });

    it('prefers a static sibling over a param at the same depth', () => {
      const about = createDomRoute('about');
      const id = createDomRoute(':id');
      const users = createDomRoute('/users', [id, about]);
      const { matchableNodes } = buildRouteTree(collectRoutesFromDom(users));

      expect(matcher.matchPath('/users/about', matchableNodes)).toEqual(
        expect.objectContaining({
          node: expect.objectContaining({ pattern: '/users/about' }),
          params: {},
        }),
      );
      expect(matcher.matchPath('/users/42', matchableNodes)).toEqual(
        expect.objectContaining({
          node: expect.objectContaining({ pattern: '/users/:id' }),
          params: { id: '42' },
        }),
      );
    });

    it('scopes nested catch-all under the parent prefix', () => {
      const fallback = createDomRoute('*');
      const about = createDomRoute('about');
      const users = createDomRoute('/users', [about, fallback]);
      const global404 = createDomRoute('*');
      const { matchableNodes, nodesByPattern } = buildRouteTree(
        collectRoutesFromDom(users, global404),
      );

      expect(nodesByPattern.get('/users/*')?.segment).toBe('*');
      expect(matcher.matchPath('/users/unknown', matchableNodes)).toEqual(
        expect.objectContaining({
          node: expect.objectContaining({ pattern: '/users/*' }),
          params: { splat: 'unknown' },
        }),
      );
      expect(matcher.matchPath('/other', matchableNodes)?.node.pattern).toBe('*');
    });

    it('reuses the match index for the same nodes array', () => {
      const { matchableNodes } = buildRouteTree(collectRoutesFromDom(createDomRoute('/a'), createDomRoute('/b')));
      expect(matcher.matchPath('/a', matchableNodes)?.node.pattern).toBe('/a');
      expect(matcher.matchPath('/b', matchableNodes)?.node.pattern).toBe('/b');
    });
  });

  describe('buildMatchedRouteInfo', () => {
    it('builds a shared chain and attaches resource keys', () => {
      const profile = createDomRoute('profile');
      const settings = createDomRoute('/settings', [profile]);
      const leaf = buildRouteTree(collectRoutesFromDom(settings)).nodesByPattern.get(
        '/settings/profile',
      )!;

      const info = matcher.buildMatchedRouteInfo(
        '/settings/profile?q=1#tab',
        '/settings/profile',
        '?q=1',
        '#tab',
        leaf,
      );

      expect(info).toEqual(
        expect.objectContaining({
          pattern: '/settings/profile',
          href: '/settings/profile?q=1#tab',
          query: { q: '1' },
          dataKey: expect.stringMatching(/^data:/),
          viewKey: expect.stringMatching(/^view:/),
        }),
      );
      expect(info.chain?.map((entry) => entry.pattern)).toEqual([
        '/settings',
        '/settings/profile',
      ]);
      expect(info.chain?.every((entry) => entry.chain === info.chain)).toBe(true);
      expect(info.chain?.[0]?.dataKey).toMatch(/^data:/);
    });
  });

  describe('destroy', () => {
    it('clears memoized matchPath and compiled URLPattern cache', () => {
      const { matchableNodes } = buildRouteTree(collectRoutesFromDom(createDomRoute('/about')));
      expect(matcher.matchPath('/about', matchableNodes)?.node.pattern).toBe('/about');
      expect(matcher.getPathParams('/users/1', '/users/:id')).toEqual({ id: '1' });

      matcher.destroy();

      expect(matcher.matchPath('/about', matchableNodes)?.node.pattern).toBe('/about');
      expect(matcher.getPathParams('/users/2', '/users/:id')).toEqual({ id: '2' });
    });
  });

  describe('trailing slash', () => {
    it('matches pathname with or without trailing slash', () => {
      const { matchableNodes } = buildRouteTree(collectRoutesFromDom(createDomRoute('/about')));
      expect(matcher.matchPath('/about', matchableNodes)?.node.pattern).toBe('/about');
      expect(matcher.matchPath('/about/', matchableNodes)?.node.pattern).toBe('/about');
    });
  });

  describe('percent-encoded / Unicode pathnames', () => {
    it('matches after URL ingress decodes the browser pathname', () => {
      const { matchableNodes, nodesByPattern } = buildRouteTree(
        collectRoutesFromDom(createDomRoute('/авторские-права.html')),
      );
      const { pathname } = resolveDocumentHrefParts(
        '/%D0%B0%D0%B2%D1%82%D0%BE%D1%80%D1%81%D0%BA%D0%B8%D0%B5-%D0%BF%D1%80%D0%B0%D0%B2%D0%B0.html',
        'https://example.com/',
      );

      expect(nodesByPattern.get('/авторские-права.html')).toBeDefined();
      expect(pathname).toBe('/авторские-права.html');
      expect(matcher.matchPath(pathname, matchableNodes)?.node.pattern).toBe(
        '/авторские-права.html',
      );
    });

    it('matches Unicode pathname against percent-encoded path attr', () => {
      const { matchableNodes } = buildRouteTree(
        collectRoutesFromDom(
          createDomRoute('/%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D0%B0%D1%8F.html'),
        ),
      );

      expect(matcher.matchPath('/главная.html', matchableNodes)?.node.pattern).toBe(
        '/главная.html',
      );
    });

    it('extracts Unicode param values from a decoded pathname', () => {
      expect(matcher.getPathParams('/пользователи/42', '/:section/:id')).toEqual({
        section: 'пользователи',
        id: '42',
      });
    });
  });

  describe('re-exports', () => {
    it('exposes route-score helpers and CATCH_ALL_SEGMENT', () => {
      expect(CATCH_ALL_SEGMENT).toBe('*');
      expect(isStaticRoutePattern('/about')).toBe(true);
      expect(isParamRoutePattern('/users/:id')).toBe(true);
      expect(isCatchAllRoutePattern('/users/*')).toBe(true);
      expect(computeMatchScore('/a/b')).toBe(2);
    });
  });
});

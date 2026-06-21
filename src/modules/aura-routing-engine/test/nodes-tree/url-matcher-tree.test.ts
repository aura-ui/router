import { AuraRoutingUrlMatcher } from '../../core/aura-routing-url-matcher';
import { buildRouteTree } from '../../core/nodes-tree/build-route-tree';
import { createDomRoute, collectRoutesFromDom } from './test-route-dom';

describe('AuraRoutingUrlMatcher + route tree', () => {
  const matcher = new AuraRoutingUrlMatcher();

  it('matchPath matches parent when branch has no index child', () => {
    const about = createDomRoute('about');
    const users = createDomRoute('/users', [about]);
    const { matchableNodes } = buildRouteTree(collectRoutesFromDom(users));

    expect(matcher.matchPath('/users', matchableNodes)?.node.fullPath).toBe('/users');
    expect(matcher.matchPath('/users/about', matchableNodes)?.node.fullPath).toBe('/users/about');
  });

  it('matchPath selects deepest matchable node', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const home = createDomRoute('/');
    const { matchableNodes } = buildRouteTree(collectRoutesFromDom(home, settings));

    expect(matcher.matchPath('/settings/profile', matchableNodes)?.node.fullPath).toBe(
      '/settings/profile',
    );
  });

  it('matchPath scopes nested catch-all under parent prefix', () => {
    const fallback = createDomRoute('*');
    const about = createDomRoute('about');
    const users = createDomRoute('/users', [about, fallback]);
    const global404 = createDomRoute('*');
    const { matchableNodes, nodesByFullPath } = buildRouteTree(
      collectRoutesFromDom(users, global404),
    );

    expect(nodesByFullPath.get('/users/*')?.routePath).toBe('*');
    expect(matcher.matchPath('/users', matchableNodes)?.node.fullPath).toBe('/users');
    expect(matcher.matchPath('/users/about', matchableNodes)?.node.fullPath).toBe('/users/about');
    expect(matcher.matchPath('/users/unknown', matchableNodes)?.node.fullPath).toBe('/users/*');
    expect(matcher.matchPath('/users/unknown', matchableNodes)?.params).toEqual({ splat: 'unknown' });
    expect(matcher.matchPath('/other', matchableNodes)?.node.fullPath).toBe('*');
  });

  it('toRouteInfo builds chain from node.branch', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const snapshot = buildRouteTree(collectRoutesFromDom(settings));
    const leaf = snapshot.nodesByFullPath.get('/settings/profile')!;

    const info = matcher.toRouteInfo('/settings/profile', '/settings/profile', '', '', leaf);

    expect(info.routePath).toBe('/settings/profile');
    expect(info.chain?.map((entry) => entry.routePath)).toEqual(['/settings', '/settings/profile']);
    expect(info.chain?.every((entry) => entry.chain === info.chain)).toBe(true);
    expect(matcher.matchPath('/settings/profile', snapshot.matchableNodes)?.node).toBe(leaf);
  });
});

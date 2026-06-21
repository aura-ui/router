import { buildTreeFromDom, createDomRoute } from './test-route-dom';

describe('buildRouteTree', () => {
  it('builds nested tree with resolved fullPath', () => {
    const profile = createDomRoute('profile');
    const security = createDomRoute('security');
    const settings = createDomRoute('/settings', [profile, security]);
    const home = createDomRoute('/');

    const { roots, nodesByFullPath, matchableNodes } = buildTreeFromDom(home, settings);

    expect(roots).toHaveLength(2);
    expect(nodesByFullPath.get('/')?.fullPath).toBe('/');
    expect(nodesByFullPath.get('/settings')?.children).toHaveLength(2);
    expect(nodesByFullPath.get('/settings/profile')?.fullPath).toBe('/settings/profile');
    expect(nodesByFullPath.get('/settings/security')?.fullPath).toBe('/settings/security');
    expect(nodesByFullPath.get('/settings/profile')?.branch.map((node) => node.fullPath)).toEqual([
      '/settings',
      '/settings/profile',
    ]);

    expect(matchableNodes.map((node) => node.fullPath)).toEqual([
      '/',
      '/settings/profile',
      '/settings/security',
      '/settings',
    ]);
  });

  it('treats index child as matchable endpoint', () => {
    const index = createDomRoute('');
    const settings = createDomRoute('/settings', [index]);
    const { matchableNodes, nodesByFullPath } = buildTreeFromDom(settings);

    expect(nodesByFullPath.get('/settings')?.isIndex).toBe(true);
    expect(matchableNodes.map((node) => node.fullPath)).toEqual(['/settings']);
  });

  it('finds roots when all nested routes are passed flat', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const home = createDomRoute('/');

    const { roots } = buildTreeFromDom(home, settings, profile);

    expect(roots.map((node) => node.fullPath)).toEqual(['/', '/settings']);
    expect(roots[1]?.children[0]?.fullPath).toBe('/settings/profile');
  });
});

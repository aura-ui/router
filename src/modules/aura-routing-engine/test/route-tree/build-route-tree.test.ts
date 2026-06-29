import { buildTreeFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('buildRouteTree', () => {  it('builds nested tree with resolved pattern', () => {
    const profile = createDomRoute('profile');
    const security = createDomRoute('security');
    const settings = createDomRoute('/settings', [profile, security]);
    const home = createDomRoute('/');

    const { roots, nodesByPattern, matchableNodes } = buildTreeFromDom(home, settings);

    expect(roots).toHaveLength(2);
    expect(nodesByPattern.get('/')?.pattern).toBe('/');
    expect(nodesByPattern.get('/settings')?.children).toHaveLength(2);
    expect(nodesByPattern.get('/settings/profile')?.pattern).toBe('/settings/profile');
    expect(nodesByPattern.get('/settings/security')?.pattern).toBe('/settings/security');
    expect(nodesByPattern.get('/settings/profile')?.branch.map((node) => node.pattern)).toEqual([
      '/settings',
      '/settings/profile',
    ]);

    expect(matchableNodes.map((node) => node.pattern)).toEqual([
      '/',
      '/settings/profile',
      '/settings/security',
      '/settings',
    ]);
  });

  it('treats index child as matchable endpoint', () => {
    const index = createDomRoute('');
    const settings = createDomRoute('/settings', [index]);
    const { matchableNodes, nodesByPattern } = buildTreeFromDom(settings);

    expect(nodesByPattern.get('/settings')?.isIndex).toBe(true);
    expect(matchableNodes.map((node) => node.pattern)).toEqual(['/settings']);
  });

  it('treats path="." as index child alias', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const index = createDomRoute('.');
    const settings = createDomRoute('/users', [index]);
    const { matchableNodes, nodesByPattern } = buildTreeFromDom(settings);

    expect(nodesByPattern.get('/users')?.isIndex).toBe(true);
    expect(nodesByPattern.get('/users')?.segment).toBe('');
    expect(matchableNodes.map((node) => node.pattern)).toEqual(['/users']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('finds roots when all nested routes are passed flat', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const home = createDomRoute('/');

    const { roots } = buildTreeFromDom(home, settings, profile);

    expect(roots.map((node) => node.pattern)).toEqual(['/', '/settings']);
    expect(roots[1]?.children[0]?.pattern).toBe('/settings/profile');
  });
});
import { AuraRoutingRouteRegistry } from '../core/aura-routing-route-registry';
import { createTestRoute } from './helpers/create-test-route';
import { buildTreeFromDom, createDomRoute } from './helpers/test-route-dom';

describe('AuraRoutingRouteRegistry.buildTree', () => {
  it('indexes flat routes by fullPath', () => {
    const registry = new AuraRoutingRouteRegistry();
    const home = createTestRoute('/');
    const users = createTestRoute('/users');

    registry.replace([home, users]);

    expect(registry.getMatchablePaths()).toEqual(['/', '/users']);
    expect(registry.getRoute('/users')).toBe(users);
    expect(registry.getNode('/users')?.depth).toBe(0);
  });

  it('rebuilds nested tree on replace', () => {
    const registry = new AuraRoutingRouteRegistry();
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const home = createDomRoute('/');

    registry.replace([home, settings, profile] as never);

    expect(registry.getRootNodes()).toHaveLength(2);
    expect(registry.getMatchableNodes().map((node) => node.fullPath)).toEqual([
      '/',
      '/settings/profile',
      '/settings',
    ]);
    expect(registry.getRoute('/settings/profile')).toBe(profile);
  });

  it('merges routes on register', () => {
    const registry = new AuraRoutingRouteRegistry();
    const home = createTestRoute('/');
    const users = createTestRoute('/users');

    registry.replace([home]);
    registry.register([users]);

    expect(registry.getMatchablePaths()).toEqual(['/', '/users']);
  });

  it('clears tree state', () => {
    const registry = new AuraRoutingRouteRegistry();
    registry.replace([createTestRoute('/')]);
    registry.clear();

    expect(registry.getRootNodes()).toEqual([]);
    expect(registry.getMatchablePaths()).toEqual([]);
  });
});

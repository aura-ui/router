import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import { PrefetchPlanResolver } from '../../core/prefetch/plan';
import { buildTreeFromDom, createDomRoute } from '../_helpers/test-route-dom';

describe('PrefetchPlanResolver LCA delta', () => {
  const matcher = new AuraRoutingUrlMatcher();

  function createResolver(currentHref = '') {
    const profile = createDomRoute('profile');
    profile.setAttribute('view', 'html::profile');
    const security = createDomRoute('security');
    security.setAttribute('view', 'html::security');
    const settings = createDomRoute('/settings', [profile, security]);
    const { matchableNodes } = buildTreeFromDom(settings);

    return {
      resolver: new PrefetchPlanResolver({
        matcher,
        getMatchableNodes: () => matchableNodes,
        getRegistryGeneration: () => 1,
        currentHref: () => currentHref,
      }),
      matchableNodes,
    };
  }

  it('uses full chain when current location is unknown', () => {
    const { resolver } = createResolver('');
    const plan = resolver.resolve('/settings/security');

    expect(plan?.enterRoutes.map((entry) => entry.pattern)).toEqual([
      '/settings',
      '/settings/security',
    ]);
    expect(plan?.lca).toBeNull();
  });

  it('prefetches only enterRoutes delta for sibling nested routes', () => {
    const { resolver } = createResolver('/settings/profile');
    const plan = resolver.resolve('/settings/security');

    expect(plan?.enterRoutes.map((entry) => entry.pattern)).toEqual(['/settings/security']);
    expect(plan?.lca?.pattern).toBe('/settings');
  });

  it('returns null when href does not match any route', () => {
    const { resolver } = createResolver('/settings/profile');
    expect(resolver.resolve('/missing')).toBeNull();
  });

  it('caches plan per href/from pair and invalidates on registry generation change', () => {
    let generation = 1;
    const profile = createDomRoute('profile');
    profile.setAttribute('view', 'html::profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const resolver = new PrefetchPlanResolver({
      matcher,
      getMatchableNodes: () => matchableNodes,
      getRegistryGeneration: () => generation,
      currentHref: () => '/settings',
    });

    const first = resolver.resolve('/settings/profile');
    generation = 2;
    const second = resolver.resolve('/settings/profile');

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
    expect(second?.registryGeneration).toBe(2);
  });

  it('clear drops cached plans', () => {
    const { resolver } = createResolver('');
    const first = resolver.resolve('/settings/security');
    resolver.clear();
    const second = resolver.resolve('/settings/security');

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it('returns null for invalid href input', () => {
    const { resolver } = createResolver('');
    expect(resolver.resolve('https://example.com')).toBeNull();
  });

  it('ignores invalid current href when resolving from location', () => {
    const profile = createDomRoute('profile');
    profile.setAttribute('view', 'html::profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const resolver = new PrefetchPlanResolver({
      matcher,
      getMatchableNodes: () => matchableNodes,
      getRegistryGeneration: () => 1,
      currentHref: () => 'https://example.com',
    });

    const plan = resolver.resolve('/settings/profile');
    expect(plan?.enterRoutes.map((entry) => entry.pattern)).toEqual(['/settings', '/settings/profile']);
    expect(plan?.lca).toBeNull();
  });
});

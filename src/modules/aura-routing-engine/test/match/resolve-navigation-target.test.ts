import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import { resolveNavigationTarget } from '../../core/match/resolve-navigation-target';
import { buildTreeFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('resolveNavigationTarget', () => {
  const matcher = new AuraRoutingUrlMatcher();

  it('returns leaf match and active chain for nested route', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const target = resolveNavigationTarget(matcher, '/settings/profile', matchableNodes);

    expect(target).not.toBeNull();
    expect(target!.leaf.pattern).toBe('/settings/profile');
    expect(target!.chain.map((info) => info.pattern)).toEqual(['/settings', '/settings/profile']);
  });

  it('returns null when no route matches', () => {
    const settings = createDomRoute('/settings');
    const { matchableNodes } = buildTreeFromDom(settings);

    expect(resolveNavigationTarget(matcher, '/missing', matchableNodes)).toBeNull();
  });

  it('matches index folder with trailing slash in URL', () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const target = resolveNavigationTarget(matcher, '/app/settings/', matchableNodes);

    expect(target).not.toBeNull();
    expect(target!.leaf.node?.isIndex).toBe(true);
    expect(target!.leaf.pattern).toBe('/app/settings');
    expect(target!.pathname).toBe('/app/settings/');
    expect(target!.href).toBe('/app/settings/');
  });

  it('canonicalizes index folder URL without trailing slash', () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const target = resolveNavigationTarget(matcher, '/app/settings', matchableNodes);

    expect(target!.href).toBe('/app/settings/');
    expect(target!.pathname).toBe('/app/settings/');
  });
});

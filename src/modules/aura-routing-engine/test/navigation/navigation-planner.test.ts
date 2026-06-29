import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationPlanner } from '../../core/navigation/navigation-planner';
import { hasReenterWork } from '../../core/navigation/reenter-work';
import { createTestRoute } from '../helpers/create-test-route';

function matched(
  path: string,
  overrides: Parameters<typeof createTestRoute>[1] = {},
): MatchedRouteInfo {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, overrides) as MatchedRouteInfo['route'],
  };
}

describe('hasReenterWork', () => {
  it('returns false when route has no reenter hooks', () => {
    expect(hasReenterWork(matched('/about'))).toBe(false);
  });

  it('returns true when route declares reenter hooks', () => {
    expect(hasReenterWork(matched('/about', { reenter: ['sync'] }))).toBe(true);
  });
});

describe('NavigationPlanner', () => {
  it('skips same-target navigation when reenter has no work', () => {
    const planner = new NavigationPlanner();
    const route = createTestRoute('/about');
    const from: MatchedRouteInfo = { ...matched('/about'), route: route as MatchedRouteInfo['route'] };
    const to: MatchedRouteInfo = { ...matched('/about'), route: route as MatchedRouteInfo['route'] };

    expect(planner.plan({ href: '/about', from, to })).toEqual({
      action: 'noop',
      reason: 'already-active',
    });
  });

  it('allows same-target navigation when reenter hooks are declared', () => {
    const planner = new NavigationPlanner();
    const route = createTestRoute('/about', { reenter: ['sync'] });
    const from: MatchedRouteInfo = { ...matched('/about'), route: route as MatchedRouteInfo['route'] };
    const to: MatchedRouteInfo = { ...matched('/about'), route: route as MatchedRouteInfo['route'] };

    expect(planner.plan({ href: '/about', from, to })).toEqual({ action: 'run' });
  });

  it('ignores duplicate href while pending', () => {
    const planner = new NavigationPlanner();
    const from = matched('/');
    const to = matched('/about');

    planner.markPending('/about');
    expect(planner.plan({ href: '/about', from, to })).toEqual({
      action: 'noop',
      reason: 'duplicate-pending',
    });
  });

  it('allows navigation to a different href while another is pending', () => {
    const planner = new NavigationPlanner();
    const from = matched('/');
    const to = matched('/gallery');

    planner.markPending('/about');
    expect(planner.plan({ href: '/gallery', from, to })).toEqual({ action: 'run' });
  });

  it('cancels a different pending href when the committed route is clicked again', () => {
    const planner = new NavigationPlanner();
    const route = createTestRoute('/about');
    const about: MatchedRouteInfo = { ...matched('/about'), route: route as MatchedRouteInfo['route'] };

    planner.markPending('/gallery');
    expect(planner.plan({ href: '/about', from: about, to: about })).toEqual({
      action: 'cancel-pending',
    });
  });

  it('clears pending href on clearPending', () => {
    const planner = new NavigationPlanner();
    const route = createTestRoute('/about');
    const about: MatchedRouteInfo = { ...matched('/about'), route: route as MatchedRouteInfo['route'] };

    planner.markPending('/about');
    planner.clearPending('/about');

    expect(planner.plan({ href: '/about', from: about, to: about })).toEqual({
      action: 'noop',
      reason: 'already-active',
    });
  });
});

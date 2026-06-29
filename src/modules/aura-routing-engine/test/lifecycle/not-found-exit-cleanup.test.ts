import { runNotFoundExitCleanup } from '../../core/lifecycle';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { createTestRoute } from '../helpers/create-test-route';

function createMatchedRoute(path: string): MatchedRouteInfo {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path),
  };
}

describe('runNotFoundExitCleanup', () => {
  it('skips cleanup when there is no previous route', () => {
    expect(() =>
      runNotFoundExitCleanup({
        from: null,
        action: 'push',
        router: { navigate: jest.fn() },
      }),
    ).not.toThrow();
  });

  it('runs left lifecycle cleanup for the previous leaf route', () => {
    const parent = createMatchedRoute('/settings');
    const leaf = createMatchedRoute('/settings/profile');
    const onLeft = jest.fn();
    leaf.route = createTestRoute('/settings/profile', { onLeft });
    parent.chain = [parent, leaf];
    leaf.chain = parent.chain;

    const router = { navigate: jest.fn() };

    runNotFoundExitCleanup({
      from: parent,
      action: 'replace',
      router,
    });

    expect(onLeft).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'left',
        from: null,
        to: { pathname: '/settings/profile' },
        route: leaf.route,
        action: 'replace',
        router,
        jobId: 0,
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

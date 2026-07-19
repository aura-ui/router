import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import { resolveRedirectHref } from '../../core/redirect/match-step';
import { MAX_REDIRECTION_STEPS } from '../../core/redirect/redirect-resolver';
import { followDeclarativeRedirects } from '../../core/redirect/redirect-resolver';
import {
  buildTreeFromDom,
  createDomRedirectRoute,
  createDomRoute,
} from '../helpers/test-route-dom';

describe('followDeclarativeRedirects', () => {
  const matcher = new AuraRoutingUrlMatcher();

  beforeEach(() => {
    matcher.destroy();
  });

  it('returns leaf match and active chain for nested route', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const outcome = followDeclarativeRedirects(matcher, '/settings/profile', matchableNodes);

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;

    expect(outcome.target.pattern).toBe('/settings/profile');
    expect(outcome.target.chain!.map((info) => info.pattern)).toEqual(['/settings', '/settings/profile']);
    expect(outcome.target.viaRedirect).toBe(false);
  });

  it('returns unmatched when no route matches', () => {
    const settings = createDomRoute('/settings');
    const { matchableNodes } = buildTreeFromDom(settings);

    expect(followDeclarativeRedirects(matcher, '/missing', matchableNodes)).toEqual({
      status: 'unmatched',
      href: '/missing',
    });
  });

  it('matches index folder with trailing slash in URL', () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const outcome = followDeclarativeRedirects(matcher, '/app/settings/', matchableNodes);

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;

    expect(outcome.target.node?.isIndex).toBe(true);
    expect(outcome.target.pattern).toBe('/app/settings');
    expect(outcome.target.pathname).toBe('/app/settings/');
    expect(outcome.target.href).toBe('/app/settings/');
  });

  it('canonicalizes index folder URL without trailing slash', () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const outcome = followDeclarativeRedirects(matcher, '/app/settings', matchableNodes);

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;

    expect(outcome.target.href).toBe('/app/settings/');
    expect(outcome.target.pathname).toBe('/app/settings/');
  });

  it('follows top-level absolute redirect to final leaf', () => {
    const profile = createDomRoute('/settings/profile');
    const alias = createDomRedirectRoute('/settings', '/settings/profile');
    const { matchableNodes } = buildTreeFromDom(alias, profile);

    const outcome = followDeclarativeRedirects(matcher, '/settings', matchableNodes);

    expect(outcome).toEqual(
      expect.objectContaining({
        status: 'resolved',
        target: expect.objectContaining({
          kind: 'matched',
          href: '/settings/profile',
          viaRedirect: true,
          pattern: '/settings/profile',
        }),
      }),
    );
  });

  it('follows nested relative redirect from index child', () => {
    const dashboard = createDomRoute('dashboard');
    const indexRedirect = createDomRedirectRoute('.', 'dashboard');
    const app = createDomRoute('/app', [indexRedirect, dashboard]);
    const { matchableNodes } = buildTreeFromDom(app);

    const outcome = followDeclarativeRedirects(matcher, '/app', matchableNodes);

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;

    expect(outcome.target.href).toBe('/app/dashboard');
    expect(outcome.target.pattern).toBe('/app/dashboard');
    expect(outcome.target.chain!.map((info) => info.pattern)).toEqual(['/app', '/app/dashboard']);
    expect(outcome.target.viaRedirect).toBe(true);
  });

  it('follows multi-step redirect chains', () => {
    const final = createDomRoute('/target');
    const hopB = createDomRedirectRoute('/b', '/target');
    const hopA = createDomRedirectRoute('/a', '/b');
    const { matchableNodes } = buildTreeFromDom(hopA, hopB, final);

    const outcome = followDeclarativeRedirects(matcher, '/a', matchableNodes);

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;

    expect(outcome.target.pattern).toBe('/target');
    expect(outcome.target.viaRedirect).toBe(true);
  });

  it('detects redirect cycles', () => {
    const routeA = createDomRedirectRoute('/a', '/b');
    const routeB = createDomRedirectRoute('/b', '/a');
    const { matchableNodes } = buildTreeFromDom(routeA, routeB);

    expect(followDeclarativeRedirects(matcher, '/a', matchableNodes)).toEqual({
      status: 'redirect-error',
      code: 'redirect-cycle',
      href: '/a',
    });
  });

  it('detects redirect depth overflow', () => {
    const routes = Array.from({ length: MAX_REDIRECTION_STEPS + 1 }, (_, index) => {
      const path = `/hop-${index}`;
      const next = `/hop-${index + 1}`;
      return createDomRedirectRoute(path, next);
    });
    const { matchableNodes } = buildTreeFromDom(...routes);

    expect(followDeclarativeRedirects(matcher, '/hop-0', matchableNodes)).toEqual({
      status: 'redirect-error',
      code: 'redirect-depth-exceeded',
      href: `/hop-${MAX_REDIRECTION_STEPS}`,
    });
  });

  it('detects redirect cycles across trailing-slash variants', () => {
    const routeA = createDomRedirectRoute('/a', '/b');
    const routeB = createDomRedirectRoute('/b', '/a/');
    const { matchableNodes } = buildTreeFromDom(routeA, routeB);

    expect(followDeclarativeRedirects(matcher, '/a', matchableNodes)).toEqual({
      status: 'redirect-error',
      code: 'redirect-cycle',
      href: '/a',
    });
  });

  it('returns unmatched when redirect target has no route', () => {
    const alias = createDomRedirectRoute('/entry', '/missing');
    const { matchableNodes } = buildTreeFromDom(alias);

    expect(followDeclarativeRedirects(matcher, '/entry', matchableNodes)).toEqual({
      status: 'unmatched',
      href: '/missing',
    });
  });

  it('preserves search and hash from the original href on the final leaf', () => {
    const profile = createDomRoute('/settings/profile');
    const alias = createDomRedirectRoute('/settings', '/settings/profile');
    const { matchableNodes } = buildTreeFromDom(alias, profile);

    const outcome = followDeclarativeRedirects(matcher, '/settings?tab=1#panel', matchableNodes);

    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;

    expect(outcome.target.href).toBe('/settings/profile?tab=1#panel');
    expect(outcome.target.search).toBe('?tab=1');
    expect(outcome.target.hash).toBe('#panel');
  });
});

describe('resolveRedirectHref', () => {
  it('resolves absolute and relative targets against parent pattern', () => {
    const dashboard = createDomRoute('dashboard');
    const indexRedirect = createDomRedirectRoute('.', 'dashboard');
    const app = createDomRoute('/app', [indexRedirect, dashboard]);
    const { nodesByPattern } = buildTreeFromDom(app);
    const indexNode = nodesByPattern.get('/app')!;

    expect(resolveRedirectHref(indexNode, 'dashboard')).toBe('/app/dashboard');
    expect(resolveRedirectHref(indexNode, '/login')).toBe('/login');
  });
});

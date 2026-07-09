import type { RouteInstance } from '../../core';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { canUseFastPath } from '../../core/route-tree/can-use-fast-path';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import { createTestRoute } from '../helpers/create-test-route';
import { createUsersIdMatch, createUsersIdNode } from '../helpers/create-dynamic-leaf-match';

function createMatchedRoute(path: string, overrides: Partial<RouteInstance> = {}): MatchedRouteInfo {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, overrides) as MatchedRouteInfo['route'],
  };
}

describe('canUseFastPath', () => {
  it('allows trivial flat sibling navigation with sync html view', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b');
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(true);
  });

  it('blocks routes without sync inline content (hasSyncContent false)', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', { view: null });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks url fetch loader routes', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      view: { loader: 'url', content: 'about.html' },
    });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks layout routes even with inline html view', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      layout: 'shell',
      view: { loader: 'html', content: '<p/>' },
    });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks routes with loading template', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      loadingTemplate: '<p>loading</p>',
    } as Partial<RouteInstance>);
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks when enter hooks are declared', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', { guard: ['auth'] });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks when enter route has load hooks (via hasSyncContent)', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', { load: ['data'] });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks when exit route has leave hooks', () => {
    const from = createMatchedRoute('/a', { leave: ['confirm'] });
    const to = createMatchedRoute('/b');
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks update plans', () => {
    const route = createTestRoute('/same');
    const from = createMatchedRoute('/same');
    const to = createMatchedRoute('/same');
    from.route = route as MatchedRouteInfo['route'];
    to.route = route as MatchedRouteInfo['route'];
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks param-change remount plans', () => {
    const node = createUsersIdNode({
      view: { loader: 'url', content: 'content/user/{{id}}.html' },
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);
    const plan = buildTransitionPlan(from, to);

    expect(plan.paramChangeRemount).toBe(true);
    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks param-change shortcut plans', () => {
    const node = createUsersIdNode();
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);
    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(true);
    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks when enter route has transition order without in/out hooks', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      transition: { order: 'parallel', in: null, out: null },
    });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });
});

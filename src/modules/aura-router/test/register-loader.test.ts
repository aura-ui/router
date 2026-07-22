/** @jest-environment jsdom */

import { NO_CACHE } from '../../aura-route/core/attr/cache-attr-parser';
import {
  ViewGraph,
  defaultLoaderRegistry,
  routeSnapshot,
  type LoaderFn,
  type MatchedRouteInfo,
  type ViewLoadContext,
} from '../../aura-routing-engine/core';
import { HandoffCache } from '../../aura-routing-engine/core/resource-graph';
import { createTestRoute } from '../../aura-routing-engine/test/helpers/create-test-route';
import { withResolvedView } from '../../aura-routing-engine/test/helpers/with-resolved-view';
import { AuraRouter } from '../core/aura-router';

function testRoute(path: string, view: { loader: string; content: string }) {
  return createTestRoute(path, {
    view,
    cache: NO_CACHE,
  } as Parameters<typeof createTestRoute>[1]) as MatchedRouteInfo['route'];
}

describe('AuraRouter.registerLoaderLoader', () => {
  it('registers LoaderFn on defaultLoaderRegistry for ViewGraph', async () => {
    let viewContent: string | undefined;
    const customLoader = (async (context: ViewLoadContext) => {
      viewContent = context.content;
      return 'custom-payload';
    }) as unknown as LoaderFn;
    expect(() => AuraRouter.registerLoader('register-loader-test', customLoader)).not.toThrow();

    const viewGraph = new ViewGraph(new HandoffCache(), {
      registry: defaultLoaderRegistry,
    });

    const payload = await viewGraph.loadPayload(
      { kind: 'view', loader: 'register-loader-test', content: 'any-ref', cache: false },
      withResolvedView({
        href: '/bridge',
        pathname: '/bridge',
        search: '',
        hash: '',
        pattern: '/bridge',
        route: testRoute('/bridge', { loader: 'register-loader-test', content: 'any-ref' }),
      }),
      new AbortController().signal,
    );

    expect(payload).toEqual({ data: 'custom-payload' });
    expect(viewContent).toBe('any-ref');
    expect(AuraRouter.getLoader('register-loader-test').needsData).toBeFalsy();
  });

  it('registerLoader accepts needsData option', () => {
    AuraRouter.registerLoader(
      'register-loader-needs-data',
      (async () => 'x') as unknown as LoaderFn,
      { needsData: true },
    );
    expect(AuraRouter.getLoader('register-loader-needs-data').needsData).toBe(true);
  });

  it('passes view attr content to LoaderFn as context.content', async () => {
    let viewContent: string | undefined;
    defaultLoaderRegistry.register(
      'content-probe',
      (async (context: ViewLoadContext) => {
        viewContent = context.content;
        return 'ok';
      }) as unknown as LoaderFn,
    );

    const service = new ViewGraph(new HandoffCache(), {
      registry: defaultLoaderRegistry,
    });

    await service.loadView(
      withResolvedView({
        href: '/analytics',
        pathname: '/analytics',
        search: '',
        hash: '',
        pattern: '/analytics',
        route: testRoute('/analytics', { loader: 'content-probe', content: 'dashboard' }),
      }),
      new AbortController().signal,
    );

    expect(viewContent).toBe('dashboard');
  });

  it('LoaderFn receives load-hook data in route snapshot when provided', async () => {
    let captured: Record<string, unknown> | undefined;

    defaultLoaderRegistry.register(
      'route-data-probe',
      (async (ctx: ViewLoadContext) => {
        captured = routeSnapshot(ctx);
        return 'ok';
      }) as unknown as LoaderFn,
    );

    const service = new ViewGraph(new HandoffCache(), {
      registry: defaultLoaderRegistry,
    });

    await service.loadView(
      withResolvedView({
        href: '/users/1',
        pathname: '/users/1',
        search: '',
        hash: '',
        pattern: '/users/:id',
        params: { id: '1' },
        route: testRoute('/users/:id', { loader: 'route-data-probe', content: 'x' }),
      }),
      new AbortController().signal,
      { data: { userId: '1' } },
    );

    expect(captured).toEqual({
      href: '/users/1',
      pattern: '/users/:id',
      params: { id: '1' },
      data: { userId: '1' },
    });
  });

  it('LoaderFn receives LoadContext with route snapshot fields', async () => {
    let captured: Record<string, unknown> | undefined;

    defaultLoaderRegistry.register(
      'route-context-probe',
      (async (ctx: ViewLoadContext) => {
        captured = routeSnapshot(ctx);
        return 'ok';
      }) as unknown as LoaderFn,
    );

    const service = new ViewGraph(new HandoffCache(), {
      registry: defaultLoaderRegistry,
    });

    await service.loadPayload(
      { kind: 'view', loader: 'route-context-probe', content: 'x', cache: false },
      withResolvedView({
        href: '/users/1?q=1',
        pathname: '/users/1',
        search: '?q=1',
        hash: '',
        pattern: '/users/:id',
        params: { id: '1' },
        query: { q: '1' },
        route: testRoute('/users/:id', { loader: 'route-context-probe', content: 'x' }),
      }),
      new AbortController().signal,
    );

    expect(captured).toEqual({
      href: '/users/1?q=1',
      pattern: '/users/:id',
      params: { id: '1' },
      query: { q: '1' },
    });
  });
});

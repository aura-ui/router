/** @jest-environment jsdom */

import {
  ViewGraph,
  defaultLoaderRegistry,
  routeSnapshot,
  type LoaderFn,
} from '../../aura-routing-engine/core';
import { AuraRouter } from '../core/aura-router';
import { NO_CACHE } from '../../aura-route/core/attr/cache-attr-parser';
import { withResolvedView } from '../../aura-routing-engine/test/helpers/with-resolved-view';

describe('AuraRouter.registerLoaderLoader', () => {
  it('registers LoaderFn on defaultLoaderRegistry for ViewGraph', async () => {
    let viewContent: string | undefined;
    const customLoader: LoaderFn = async (context) => {
      viewContent = context.content;
      return 'custom-payload';
    };
    expect(() => AuraRouter.registerLoader('register-loader-test', customLoader)).not.toThrow();

    const viewGraph = new ViewGraph({
      registry: defaultLoaderRegistry,
    });

    const payload = await viewGraph.loadViewDescriptor(
      { kind: 'view', loader: 'register-loader-test', content: 'any-ref', cache: false },
      {
        href: '/bridge',
        pathname: '/bridge',
        search: '',
        hash: '',
        pattern: '/bridge',
        route: {
          layout: '',
          view: 'register-loader-test::any-ref',
          cache: NO_CACHE,
        },
      },
      new AbortController().signal,
    );

    expect(payload).toBe('custom-payload');
    expect(viewContent).toBe('any-ref');
    expect(AuraRouter.getLoader('register-loader-test').needsData).toBeFalsy();
  });

  it('registerLoader accepts needsData option', () => {
    AuraRouter.registerLoader('register-loader-needs-data', async () => 'x', {
      needsData: true,
    });
    expect(AuraRouter.getLoader('register-loader-needs-data').needsData).toBe(true);
  });

  it('passes view attr content to LoaderFn as context.content', async () => {
    let viewContent: string | undefined;
    defaultLoaderRegistry.register('content-probe', async (context) => {
      viewContent = context.content;
      return 'ok';
    });

    const service = new ViewGraph({
      registry: defaultLoaderRegistry,
    });

    await service.loadView(
      withResolvedView({
        href: '/analytics',
        pathname: '/analytics',
        search: '',
        hash: '',
        pattern: '/analytics',
        route: {
          layout: '',
          view: { loader: 'content-probe', content: 'dashboard' },
          cache: NO_CACHE,
        },
        resolvedView: { loader: 'content-probe', content: 'dashboard' },
      }),
      new AbortController().signal,
    );

    expect(viewContent).toBe('dashboard');
  });

  it('LoaderFn receives load-hook data in route snapshot when provided', async () => {
    let captured: Record<string, unknown> | undefined;

    defaultLoaderRegistry.register('route-data-probe', async (ctx) => {
      captured = routeSnapshot(ctx);
      return 'ok';
    });

    const service = new ViewGraph({
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
        route: {
          layout: '',
          view: { loader: 'route-data-probe', content: 'x' },
          cache: NO_CACHE,
        },
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

    defaultLoaderRegistry.register('route-context-probe', async (ctx) => {
      captured = routeSnapshot(ctx);
      return 'ok';
    });

    const service = new ViewGraph({
      registry: defaultLoaderRegistry,
    });

    await service.loadViewDescriptor(
      { kind: 'view', loader: 'route-context-probe', content: 'x', cache: false },
      {
        href: '/users/1?q=1',
        pathname: '/users/1',
        search: '?q=1',
        hash: '',
        pattern: '/users/:id',
        params: { id: '1' },
        query: { q: '1' },
        route: { layout: '', view: '', cache: NO_CACHE },
      },
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

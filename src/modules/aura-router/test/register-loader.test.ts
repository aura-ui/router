/** @jest-environment jsdom */

import {
  PayloadCache,
  ViewGraph,
  defaultLoaderRegistry,
  routeSnapshot,
  type LoaderFn,
} from '../../aura-routing-engine/core';
import { AuraRouter } from '../core/aura-router';
import { withResolvedView } from '../../aura-routing-engine/test/helpers/with-resolved-view';

describe('AuraRouter.registerLoaderLoader', () => {
  it('registers LoaderFn on defaultLoaderRegistry for ViewGraph', async () => {
    let ref: string | undefined;
    const customLoader: LoaderFn = async (context) => {
      ref = context.ref;
      return 'custom-payload';
    };
    AuraRouter.registerLoader('register-loader-test', customLoader);

    const viewGraph = new ViewGraph({
      registry: defaultLoaderRegistry,
      cache: new PayloadCache(),
    });

    const payload = await viewGraph.loadViewDescriptor(
      { kind: 'view', loader: 'register-loader-test', ref: 'any-ref', cache: false },
      {
        href: '/bridge',
        pathname: '/bridge',
        search: '',
        hash: '',
        pattern: '/bridge',
        route: {
          layout: '',
          view: 'register-loader-test::any-ref',
          preserve: { view: false, data: false },
        },
      },
      new AbortController().signal,
    );

    expect(payload).toBe('custom-payload');
    expect(ref).toBe('any-ref');
  });

  it('passes view attr ref to LoaderFn as context.ref', async () => {
    let ref: string | undefined;
    defaultLoaderRegistry.register('ref-probe', async (context) => {
      ref = context.ref;
      return 'ok';
    });

    const service = new ViewGraph({
      registry: defaultLoaderRegistry,
      cache: new PayloadCache(),
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
          view: { type: 'ref-probe', content: 'dashboard' },
          preserve: { view: false, data: false },
        },
        resolvedView: { type: 'ref-probe', ref: 'dashboard' },
      }),
      new AbortController().signal,
    );

    expect(ref).toBe('dashboard');
  });

  it('LoaderFn receives load-hook data in route snapshot when provided', async () => {
    let captured: Record<string, unknown> | undefined;

    defaultLoaderRegistry.register('route-data-probe', async (ctx) => {
      captured = routeSnapshot(ctx);
      return 'ok';
    });

    const service = new ViewGraph({
      registry: defaultLoaderRegistry,
      cache: new PayloadCache(),
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
          view: { type: 'route-data-probe', content: 'x' },
          preserve: { view: false, data: false },
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
      cache: new PayloadCache(),
    });

    await service.loadViewDescriptor(
      { kind: 'view', loader: 'route-context-probe', ref: 'x', cache: false },
      {
        href: '/users/1?q=1',
        pathname: '/users/1',
        search: '?q=1',
        hash: '',
        pattern: '/users/:id',
        params: { id: '1' },
        query: { q: '1' },
        route: { layout: '', view: '', preserve: { view: false, data: false } },
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

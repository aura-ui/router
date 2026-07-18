import {
  createBranchResolveContext,
  resolveEnterBranch,
  type BranchResolveContext,
  type DataSnapshot,
  type MatchedRouteInfo,
} from '../../core';
import {
  ViewGraph,
  LoaderRegistry,
} from '../../core/view-graph';
import { HandoffCache } from '../../core/resource-graph';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import { resolveRouteData } from '../../core/data-graph/route-data';
import { resourceKeys } from '../../core/match/resource-keys';
import { withResolvedView } from '../helpers/with-resolved-view';
import { createTestRoute } from '../helpers/create-test-route';
import type { RouteInstance } from '../../core';

function matched(
  pattern: string,
  overrides: Partial<MatchedRouteInfo> = {},
): MatchedRouteInfo {
  const { route: routeOverride, ...rest } = overrides;
  const info = withResolvedView({
    href: pattern,
    pathname: pattern,
    search: '',
    hash: '',
    pattern,
    route: createTestRoute(pattern, {
      layout: '',
      view: null,
      cache: NO_CACHE,
      ...(routeOverride as Partial<RouteInstance> | undefined),
    }),
    ...rest,
  });
  if (info.dataKey == null) {
    const keys = resourceKeys(info);
    info.dataKey = keys.dataKey;
    info.viewKey = keys.viewKey;
  }
  return info;
}

function resolveCtx(signal: AbortSignal, aborted = () => signal.aborted): BranchResolveContext {
  return { signal, aborted };
}

describe('resolveEnterBranch', () => {
  it('returns empty pre-resolved contents for an empty branch', async () => {
    const signal = new AbortController().signal;

    const result = await resolveEnterBranch([], { loadView: async () => null }, resolveCtx(signal));

    expect(result).toEqual({ status: 'ok', preResolvedContents: [] });
  });

  it('resolves all routes in parallel and preserves enter order', async () => {
    const signal = new AbortController().signal;

    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, cache: NO_CACHE },
    });
    const index = matched('/users/1', {
      pattern: '/users/:id',
      route: { layout: '', view: { loader: 'html', content: '<p>list</p>' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: '<p>list</p>' },
    });

    const resolve = jest.fn(async (routeInfo: MatchedRouteInfo) => {
      await new Promise((r) => setTimeout(r, routeInfo.pattern === '/users' ? 30 : 5));
      return routeInfo.pattern === '/users' ? '<layout/>' : '<index/>';
    });

    const result = await resolveEnterBranch([layout, index], { loadView: resolve }, resolveCtx(signal));

    expect(result).toEqual({ status: 'ok', preResolvedContents: ['<layout/>', '<index/>'] });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('passes load-hook data per route', async () => {
    const signal = new AbortController().signal;
    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, cache: NO_CACHE },
    });
    const index = matched('/users/1', {
      pattern: '/users/:id',
      route: { layout: '', view: { loader: 'html', content: '<p>one</p>' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: '<p>one</p>' },
    });

    const resolve = jest.fn(async (_route, _signal, options) => (
      options?.data ? JSON.stringify(options.data) : 'no-data'
    ));

    const result = await resolveEnterBranch(
      [layout, index],
      { loadView: resolve },
      {
        ...resolveCtx(signal),
        dataFor: (route) => (route === index ? { id: '1' } : undefined),
      },
    );

    expect(result).toEqual({ status: 'ok', preResolvedContents: ['no-data', '{"id":"1"}'] });
    expect(resolve).toHaveBeenNthCalledWith(1, layout, signal, undefined);
    expect(resolve).toHaveBeenNthCalledWith(2, index, signal, { data: { id: '1' } });
  });

  it('returns aborted when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await resolveEnterBranch(
      [matched('/page')],
      { loadView: async () => 'never' },
      resolveCtx(controller.signal),
    );

    expect(result).toEqual({ status: 'aborted' });
  });

  it('returns aborted when navigation is cancelled during resolve', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = resolveEnterBranch(
      [matched('/page')],
      {
        loadView: async () => {
          await gate;
          return '<span>late</span>';
        },
      },
      resolveCtx(controller.signal),
    );

    controller.abort();
    release();

    expect(await pending).toEqual({ status: 'aborted' });
  });

  it('returns error when a loader throws', async () => {
    const signal = new AbortController().signal;
    const route = matched('/page');
    const boom = new Error('load failed');

    const result = await resolveEnterBranch(
      [route],
      { loadView: async () => { throw boom; } },
      resolveCtx(signal),
    );

    expect(result).toEqual({ status: 'error', error: boom, route });
  });

  it('returns error with the failing route in a multi-route branch', async () => {
    const signal = new AbortController().signal;
    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, cache: NO_CACHE },
    });
    const leaf = matched('/users/1', {
      pattern: '/users/:id',
      route: { layout: '', view: { loader: 'html', content: '<p>x</p>' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: '<p>x</p>' },
    });
    const boom = new Error('leaf failed');

    const result = await resolveEnterBranch(
      [layout, leaf],
      {
        loadView: async (routeInfo) => {
          if (routeInfo.pattern === '/users/:id') throw boom;
          return '<layout/>';
        },
      },
      resolveCtx(signal),
    );

    expect(result).toEqual({ status: 'error', error: boom, route: leaf });
  });

  it('returns aborted when isActive becomes false after resolve', async () => {
    let active = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const ctx = createBranchResolveContext({
      signal: new AbortController().signal,
      isActive: () => active,
    });

    const pending = resolveEnterBranch(
      [matched('/page')],
      { loadView: async () => { await gate; return '<span>late</span>'; } },
      ctx,
    );

    release();
    await gate;
    active = false;

    expect(await pending).toEqual({ status: 'aborted' });
  });

  it('createBranchResolveContext uses isActive for aborted', () => {
    let active = true;
    const ctx = createBranchResolveContext({
      signal: new AbortController().signal,
      isActive: () => active,
    });

    expect(ctx.aborted()).toBe(false);
    active = false;
    expect(ctx.aborted()).toBe(true);
  });

  it('createBranchResolveContext passes load-hook data from snapshot', async () => {
    const layout = matched('/users', {
      route: {
        layout: 'users-layout',
        view: null,
        cache: NO_CACHE,
        load: ['user'],
        hasLoad: true,
      },
    });
    const snapshot = new Map<string, unknown>([
      [layout.dataKey!, { userId: '42' }],
    ]) as DataSnapshot;

    const resolve = jest.fn(async (_route, _signal, options) => (
      options?.data ? JSON.stringify(options.data) : 'no-data'
    ));

    const result = await resolveEnterBranch(
      [layout],
      { loadView: resolve },
      createBranchResolveContext({
        signal: new AbortController().signal,
        isActive: () => true,
        dataSnapshot: snapshot,
      }),
    );

    expect(result).toEqual({ status: 'ok', preResolvedContents: ['{"userId":"42"}'] });
    expect(resolveRouteData(snapshot, layout)).toEqual({ userId: '42' });
  });

  it('resolves via ViewGraph without touching the DOM', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.register('template', async (ctx) => `<header>${ctx.content}</header>`);
    registry.register('html', async (ctx) => ctx.content);

    const content = new ViewGraph(new HandoffCache(), { registry });
    const signal = new AbortController().signal;

    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, cache: NO_CACHE },
    });
    const index = matched('/users', {
      pattern: '/users',
      route: { layout: '', view: { loader: 'html', content: '<p>list</p>' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: '<p>list</p>' },
    });

    const result = await resolveEnterBranch([layout, index], content, resolveCtx(signal));

    expect(result).toEqual({
      status: 'ok',
      preResolvedContents: ['<header>users-layout</header>', '<p>list</p>'],
    });
    expect(document.body.children).toHaveLength(0);
  });

  it('createBranchResolveContext forwards paramChangeRemount', () => {
    const ctx = createBranchResolveContext({
      signal: new AbortController().signal,
      isActive: () => true,
      paramChangeRemount: true,
    });

    expect(ctx.paramChangeRemount).toBe(true);
  });
});

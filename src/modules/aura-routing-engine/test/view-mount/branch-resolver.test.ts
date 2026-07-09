import {
  createBranchResolveContext,
  resolveEnterBranch,
  type BranchResolveContext,
  type DataSnapshot,
  type MatchedRouteInfo,
} from '../../core';
import {
  ContentGraph,
  PayloadCache,
  LoaderRegistry,
} from '../../core/content-graph';
import { shouldUsePrepareCommitEnterBranch } from '../../core/view-mount/branch-resolver';
import { buildRouteDataKey, resolveRouteData } from '../../core/data-graph/route-data';
import { createMatchedRoute } from '../helpers/create-mock-transaction';
import { withResolvedView } from '../helpers/with-resolved-view';

function matched(
  pattern: string,
  overrides: Partial<MatchedRouteInfo> = {},
): MatchedRouteInfo {
  return withResolvedView({
    href: pattern,
    pathname: pattern,
    search: '',
    hash: '',
    pattern,
    route: {
      layout: '',
      view: null,
      preserve: { view: false },
    },
    ...overrides,
  } as MatchedRouteInfo);
}

function resolveCtx(signal: AbortSignal, aborted = () => signal.aborted): BranchResolveContext {
  return { signal, aborted };
}

describe('resolveEnterBranch', () => {
  it('returns empty pre-resolved contents for an empty branch', async () => {
    const signal = new AbortController().signal;

    const result = await resolveEnterBranch([], { resolve: async () => null }, resolveCtx(signal));

    expect(result).toEqual({ status: 'ok', preResolvedContents: [] });
  });

  it('resolves all routes in parallel and preserves enter order', async () => {
    const signal = new AbortController().signal;

    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, preserve: { view: false } },
    });
    const index = matched('/users/1', {
      pattern: '/users/:id',
      route: { layout: '', view: { type: 'html', content: '<p>list</p>' }, preserve: { view: false } },
      resolvedView: { type: 'html', ref: '<p>list</p>' },
    });

    const resolve = jest.fn(async (routeInfo: MatchedRouteInfo) => {
      await new Promise((r) => setTimeout(r, routeInfo.pattern === '/users' ? 30 : 5));
      return routeInfo.pattern === '/users' ? '<layout/>' : '<index/>';
    });

    const result = await resolveEnterBranch([layout, index], { resolve }, resolveCtx(signal));

    expect(result).toEqual({ status: 'ok', preResolvedContents: ['<layout/>', '<index/>'] });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('passes load-hook data per route', async () => {
    const signal = new AbortController().signal;
    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, preserve: { view: false } },
    });
    const index = matched('/users/1', {
      pattern: '/users/:id',
      route: { layout: '', view: { type: 'html', content: '<p>one</p>' }, preserve: { view: false } },
      resolvedView: { type: 'html', ref: '<p>one</p>' },
    });

    const resolve = jest.fn(async (_route, _signal, options) => (
      options?.data ? JSON.stringify(options.data) : 'no-data'
    ));

    const result = await resolveEnterBranch(
      [layout, index],
      { resolve },
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
      { resolve: async () => 'never' },
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
        resolve: async () => {
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
      { resolve: async () => { throw boom; } },
      resolveCtx(signal),
    );

    expect(result).toEqual({ status: 'error', error: boom, route });
  });

  it('returns error with the failing route in a multi-route branch', async () => {
    const signal = new AbortController().signal;
    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, preserve: { view: false } },
    });
    const leaf = matched('/users/1', {
      pattern: '/users/:id',
      route: { layout: '', view: { type: 'html', content: '<p>x</p>' }, preserve: { view: false } },
      resolvedView: { type: 'html', ref: '<p>x</p>' },
    });
    const boom = new Error('leaf failed');

    const result = await resolveEnterBranch(
      [layout, leaf],
      {
        resolve: async (routeInfo) => {
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
      { resolve: async () => { await gate; return '<span>late</span>'; } },
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
        preserve: { view: false },
        load: ['user'],
        hasLoad: true,
      },
    });
    const snapshot = new Map<string, unknown>([
      [buildRouteDataKey(layout, ['user']), { userId: '42' }],
    ]) as DataSnapshot;

    const resolve = jest.fn(async (_route, _signal, options) => (
      options?.data ? JSON.stringify(options.data) : 'no-data'
    ));

    const result = await resolveEnterBranch(
      [layout],
      { resolve },
      createBranchResolveContext({
        signal: new AbortController().signal,
        isActive: () => true,
        dataSnapshot: snapshot,
      }),
    );

    expect(result).toEqual({ status: 'ok', preResolvedContents: ['{"userId":"42"}'] });
    expect(resolveRouteData(snapshot, layout)).toEqual({ userId: '42' });
  });

  it('resolves via ContentGraph without touching the DOM', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.registerFn('template', async (ctx) => `<header>${ctx.ref}</header>`);
    registry.registerFn('html', async (ctx) => ctx.ref);

    const content = new ContentGraph({ registry, cache: new PayloadCache() });
    const signal = new AbortController().signal;

    const layout = matched('/users', {
      route: { layout: 'users-layout', view: null, preserve: { view: false } },
    });
    const index = matched('/users', {
      pattern: '/users',
      route: { layout: '', view: { type: 'html', content: '<p>list</p>' }, preserve: { view: false } },
      resolvedView: { type: 'html', ref: '<p>list</p>' },
    });

    const result = await resolveEnterBranch([layout, index], content, resolveCtx(signal));

    expect(result).toEqual({
      status: 'ok',
      preResolvedContents: ['<header>users-layout</header>', '<p>list</p>'],
    });
    expect(document.body.children).toHaveLength(0);
  });
});

describe('shouldUsePrepareCommitEnterBranch', () => {
  const base = {
    paramChangeRemount: false,
  };

  it('returns true when transition order is set on a multi-route enter branch', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        enterRoutes: [matched('/a'), matched('/b')],
      }),
    ).toBe(true);
  });

  it('returns false for param-change remount', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        paramChangeRemount: true,
        enterRoutes: [matched('/users/1'), matched('/users/2')],
      }),
    ).toBe(false);
  });

  it('returns true for multiple enter routes', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        enterRoutes: [matched('/users'), matched('/users/1')],
      }),
    ).toBe(true);
  });

  it('returns true for a single route with async content', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        enterRoutes: [createMatchedRoute('/page', { load: ['fetch'] })],
      }),
    ).toBe(true);
  });

  it('returns false for a single sync route', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        enterRoutes: [createMatchedRoute('/page')],
      }),
    ).toBe(false);
  });

  it('returns true for cross-outlet full branch swap', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        enterRoutes: [createMatchedRoute('/about')],
        transitionPlan: {
          exitRoutes: [createMatchedRoute('/settings/profile')],
          enterRoutes: [createMatchedRoute('/about')],
          lca: null,
        },
      }),
    ).toBe(true);
  });

  it('returns false when mount-strategy is per-route', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        enterRoutes: [createMatchedRoute('/users'), createMatchedRoute('/users/1')],
        mountStrategy: 'per-route',
      }),
    ).toBe(false);
  });

  it('returns true when mount-strategy is branch for a single sync route', () => {
    expect(
      shouldUsePrepareCommitEnterBranch({
        ...base,
        enterRoutes: [createMatchedRoute('/page')],
        mountStrategy: 'branch',
      }),
    ).toBe(true);
  });
});

import { HookRegistry } from '../../core/hooks/registry';
import {
  createLifecycleContext,
  toLifecycleContextInput,
  toRouteInfo,
  type LifecycleRuntimeContext,
} from '../../core/lifecycle';
import { ViewCommitTracker } from '../../core/view-mount/view-commit-tracker';
import { createTestRoute } from '../helpers/create-test-route';

describe('lifecycle context', () => {
  it('createLifecycleContext maps matched route and navigation input to hook context', () => {
    const fromRoute = createTestRoute('/from');
    const toRoute = createTestRoute('/to');
    const job = { id: 7, signal: new AbortController().signal };
    const router = { navigate: jest.fn() };

    const ctx = createLifecycleContext(
      'enter',
      {
        href: '/to',
        pathname: '/to',
        search: '?a=1',
        hash: '',
        pattern: '/to',
        params: { id: '1' },
        query: { a: '1' },
        route: toRoute,
      },
      {
        from: {
          href: '/from',
          pathname: '/from',
          search: '',
          hash: '',
          pattern: '/from',
          route: fromRoute,
        },
        action: 'replace',
        router,
        navigationJob: job,
      },
    );

    expect(ctx).toMatchObject({
      phase: 'enter',
      from: { pathname: '/from' },
      to: { pathname: '/to', params: { id: '1' }, query: { a: '1' } },
      route: toRoute,
      action: 'replace',
      jobId: 7,
      signal: job.signal,
      router,
    });
  });

  it('toRouteInfo omits empty optional fields', () => {
    expect(
      toRouteInfo({
        href: '/x',
        pathname: '/x',
        search: '',
        hash: '',
        pattern: '/x',
        route: createTestRoute('/x'),
      }),
    ).toEqual({ pathname: '/x' });
  });

  it('toLifecycleContextInput maps runtime context to route callback slice', () => {
    const matchedRoute = {
      href: '/to',
      pathname: '/to',
      search: '',
      hash: '',
      pattern: '/to',
      route: createTestRoute('/to'),
    };

    const signal = new AbortController().signal;
    const runtime: LifecycleRuntimeContext = {
      transaction: {
        from: null,
        to: matchedRoute,
        action: 'push',
        plan: {
          exitRoutes: [],
          enterRoutes: [matchedRoute],
          lca: null,
          reenter: false,
        },
      },
      transactionId: 1,
      transactionSignal: signal,
      router: { navigate: jest.fn() },
      hookRegistry: new HookRegistry(),
      viewCommitTracker: new ViewCommitTracker('/to'),
      isJobActive: () => true,
    };

    expect(toLifecycleContextInput(runtime)).toEqual({
      from: runtime.transaction.from,
      action: runtime.transaction.action,
      router: runtime.router,
      navigationJob: { id: 1, signal },
    });
  });
});

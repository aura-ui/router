import { NavigationTransactionPipelinePhase } from '../../core/navigation/navigation-transaction-pipeline-phase';
import { createTestRoute } from '../helpers/create-test-route';

describe('NavigationTransactionPipelinePhase.buildPhaseContext', () => {
  it('maps matched route and navigation slice to hook context', () => {
    const fromRoute = createTestRoute('/from');
    const toRoute = createTestRoute('/to');
    const transactionSignal = new AbortController().signal;
    const router = { navigate: jest.fn() };

    const ctx = NavigationTransactionPipelinePhase.buildPhaseContext(
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
        transactionId: 7,
        transactionSignal,
      },
    );

    expect(ctx).toMatchObject({
      phase: 'enter',
      from: { pathname: '/from' },
      to: { pathname: '/to', params: { id: '1' }, query: { a: '1' } },
      route: toRoute,
      action: 'replace',
      transactionId: 7,
      transactionSignal,
      router,
    });
  });

  it('omits empty optional RouteInfo fields', () => {
    const ctx = NavigationTransactionPipelinePhase.buildPhaseContext(
      'enter',
      {
        href: '/x',
        pathname: '/x',
        search: '',
        hash: '',
        pattern: '/x',
        route: createTestRoute('/x'),
      },
      {
        from: null,
        action: 'push',
        router: { navigate: jest.fn() },
        transactionId: 1,
        transactionSignal: new AbortController().signal,
      },
    );

    expect(ctx.to).toEqual({ pathname: '/x' });
    expect(ctx.from).toBeNull();
  });

  it('includes optional data and error fields', () => {
    const ctx = NavigationTransactionPipelinePhase.buildPhaseContext(
      'error',
      {
        href: '/to',
        pathname: '/to',
        search: '',
        hash: '',
        pattern: '/to',
        route: createTestRoute('/to'),
      },
      {
        from: null,
        action: 'push',
        router: { navigate: jest.fn() },
        transactionId: 1,
        transactionSignal: new AbortController().signal,
        data: { id: 1 },
        error: new Error('failed'),
      },
    );

    expect(ctx.data).toEqual({ id: 1 });
    expect(ctx.error).toEqual(new Error('failed'));
  });
});

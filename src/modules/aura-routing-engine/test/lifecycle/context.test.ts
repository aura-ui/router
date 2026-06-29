import { createLifecycleContext, toRouteInfo } from '../../core/lifecycle';
import { AuraRoutingProcessorJob } from '../../core/processor/cancellation/job';
import { createTestRoute } from '../helpers/create-test-route';

describe('createLifecycleContext', () => {
  it('maps matched route and navigation input to hook context', () => {
    const fromRoute = createTestRoute('/from');
    const toRoute = createTestRoute('/to');
    const job = new AuraRoutingProcessorJob(7);
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
        job,
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
});

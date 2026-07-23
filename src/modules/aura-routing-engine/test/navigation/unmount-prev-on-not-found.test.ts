import { unmountPrevOnNotFound } from '../../core/navigation/unmount-prev-on-not-found';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';
import { createTestRoute } from '../_helpers/create-test-route';

describe('unmountPrevOnNotFound', () => {
  it('skips cleanup when there is no previous route', () => {
    expect(() =>
      unmountPrevOnNotFound({
        from: null,
        action: 'push',
        router: { navigate: jest.fn() },
      }),
    ).not.toThrow();
  });

  it('runs left lifecycle cleanup for the previous leaf route', () => {
    const parent = createMatchedRoute('/settings');
    const leaf = createMatchedRoute('/settings/profile');
    const onUnmount = jest.fn();
    leaf.route = createTestRoute('/settings/profile', { onUnmount });
    parent.chain = [parent, leaf];
    leaf.chain = parent.chain;

    const router = { navigate: jest.fn() };

    unmountPrevOnNotFound({
      from: parent,
      action: 'replace',
      router,
    });

    expect(onUnmount).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'unmount',
        from: null,
        to: { pathname: '/settings/profile' },
        route: leaf.route,
        action: 'replace',
        router,
        transactionId: 0,
        transactionSignal: expect.any(AbortSignal),
      }),
    );
  });
});

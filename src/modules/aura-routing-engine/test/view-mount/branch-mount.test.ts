import { mountEnterBranch } from '../../core/view-mount/branch-mount';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

describe('mountEnterBranch', () => {
  it('mounts enter routes in order with pre-resolved payloads', () => {
    const calls: Array<{ path: string; payload: unknown }> = [];
    const layout = createMatchedRoute('/users', {
      applyPreResolved: (_info, options) => {
        calls.push({ path: '/users', payload: options?.preResolvedContent });
        return { status: 'ok' };
      },
    });
    const index = createMatchedRoute('/users/1', {
      applyPreResolved: (_info, options) => {
        calls.push({ path: '/users/1', payload: options?.preResolvedContent });
        return { status: 'ok' };
      },
    });

    const signal = new AbortController().signal;
    const result = mountEnterBranch(
      [layout, index],
      ['<layout/>', '<index/>'],
      { signal, aborted: () => false },
    );

    expect(result).toEqual({ status: 'ok' });
    expect(calls).toEqual([
      { path: '/users', payload: '<layout/>' },
      { path: '/users/1', payload: '<index/>' },
    ]);
  });

  it('returns aborted when navigation is cancelled mid-mount', () => {
    let active = true;
    const first = createMatchedRoute('/a', {
      applyPreResolved: () => {
        active = false;
        return { status: 'ok' };
      },
    });
    const second = createMatchedRoute('/b', {
      applyPreResolved: jest.fn(() => ({ status: 'ok' })),
    });

    const result = mountEnterBranch(
      [first, second],
      ['<a/>', '<b/>'],
      {
        signal: new AbortController().signal,
        aborted: () => active,
      },
    );

    expect(result).toEqual({ status: 'aborted' });
    expect(second.route.applyPreResolved).not.toHaveBeenCalled();
  });

  it('returns error and rolls back prior routes when a node fails', () => {
    const boom = new Error('mount failed');
    const revertInFlightView = jest.fn();
    const layout = createMatchedRoute('/users', {
      applyPreResolved: () => ({ status: 'ok' }),
      revertInFlightView,
    });
    const index = createMatchedRoute('/users/1', {
      applyPreResolved: () => ({ status: 'error', error: boom }),
    });

    const result = mountEnterBranch(
      [layout, index],
      ['<layout/>', '<index/>'],
      { signal: new AbortController().signal, aborted: () => false },
    );

    expect(result).toEqual({ status: 'error', error: boom, route: index });
    expect(revertInFlightView).toHaveBeenCalledTimes(1);
  });

  it('passes load-hook data from resolve context', () => {
    const layout = createMatchedRoute('/users');
    const index = createMatchedRoute('/users/1');
    const applyPreResolved = jest.fn(() => ({ status: 'ok' as const }));
    layout.route.applyPreResolved = applyPreResolved;
    index.route.applyPreResolved = applyPreResolved;

    mountEnterBranch(
      [layout, index],
      ['<layout/>', '<index/>'],
      {
        signal: new AbortController().signal,
        aborted: () => false,
        dataFor: () => ({ id: '1' }),
      },
    );

    expect(applyPreResolved).toHaveBeenNthCalledWith(
      1,
      layout,
      expect.objectContaining({ preResolvedContent: '<layout/>', data: { id: '1' } }),
    );
    expect(applyPreResolved).toHaveBeenNthCalledWith(
      2,
      index,
      expect.objectContaining({ preResolvedContent: '<index/>', data: { id: '1' } }),
    );
  });

  it('returns error when payloads length does not match enter routes', () => {
    const route = createMatchedRoute('/page', {
      applyPreResolved: () => ({ status: 'ok' }),
    });

    const result = mountEnterBranch(
      [route],
      [],
      { signal: new AbortController().signal, aborted: () => false },
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toEqual(expect.objectContaining({
        message: 'Branch mount: expected 1 payloads, got 0',
      }));
    }
  });
});

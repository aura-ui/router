import { mountEnterBranch } from '../../core/view-mount/branch-mount';
import { asViewSnapshot, createMatchedRoute } from '../_helpers/create-mock-transaction';

describe('mountEnterBranch', () => {
  it('mounts enter routes in order with pre-resolved contents', () => {
    const calls: Array<{ path: string; payload: unknown }> = [];
    const layout = createMatchedRoute('/users', {
      mountResolvedView: (_info, options) => {
        calls.push({ path: '/users', payload: options?.preResolvedView });
        return { status: 'ok' };
      },
    });
    const index = createMatchedRoute('/users/1', {
      mountResolvedView: (_info, options) => {
        calls.push({ path: '/users/1', payload: options?.preResolvedView });
        return { status: 'ok' };
      },
    });

    const signal = new AbortController().signal;
    const result = mountEnterBranch(
      [layout, index],
      asViewSnapshot('<layout/>', '<index/>'),
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
      mountResolvedView: () => {
        active = false;
        return { status: 'ok' };
      },
    });
    const second = createMatchedRoute('/b', {
      mountResolvedView: jest.fn(() => ({ status: 'ok' })),
    });

    const result = mountEnterBranch(
      [first, second],
      asViewSnapshot('<a/>', '<b/>'),
      {
        signal: new AbortController().signal,
        aborted: () => active,
      },
    );

    expect(result).toEqual({ status: 'aborted' });
    expect(second.route.mountResolvedView).not.toHaveBeenCalled();
  });

  it('returns error and rolls back prior routes when a node fails', () => {
    const boom = new Error('mount failed');
    const revertInFlightView = jest.fn();
    const layout = createMatchedRoute('/users', {
      mountResolvedView: () => ({ status: 'ok' }),
      revertInFlightView,
    });
    const index = createMatchedRoute('/users/1', {
      mountResolvedView: () => ({ status: 'error', error: boom }),
    });

    const result = mountEnterBranch(
      [layout, index],
      asViewSnapshot('<layout/>', '<index/>'),
      { signal: new AbortController().signal, aborted: () => false },
    );

    expect(result).toEqual({ status: 'error', error: boom, route: index });
    expect(revertInFlightView).toHaveBeenCalledTimes(1);
  });

  it('passes load-hook data from dataSnapshot', () => {
    const layout = createMatchedRoute('/users', { load: ['u'], hasLoad: true });
    const index = createMatchedRoute('/users/1', { load: ['u'], hasLoad: true });
    const mountResolvedView = jest.fn(() => ({ status: 'ok' as const }));
    layout.route.mountResolvedView = mountResolvedView;
    index.route.mountResolvedView = mountResolvedView;
    const dataSnapshot = new Map([
      [layout.dataKey!, { id: '1' }],
      [index.dataKey!, { id: '1' }],
    ]);

    mountEnterBranch(
      [layout, index],
      asViewSnapshot('<layout/>', '<index/>'),
      {
        signal: new AbortController().signal,
        aborted: () => false,
        dataSnapshot,
      },
    );

    expect(mountResolvedView).toHaveBeenNthCalledWith(
      1,
      layout,
      expect.objectContaining({ preResolvedView: '<layout/>', data: { id: '1' } }),
    );
    expect(mountResolvedView).toHaveBeenNthCalledWith(
      2,
      index,
      expect.objectContaining({ preResolvedView: '<index/>', data: { id: '1' } }),
    );
  });

  it('returns error when view snapshot length does not match enter routes', () => {
    const route = createMatchedRoute('/page', {
      mountResolvedView: () => ({ status: 'ok' }),
    });

    const result = mountEnterBranch(
      [route],
      [],
      { signal: new AbortController().signal, aborted: () => false },
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toEqual(expect.objectContaining({
        message: 'Branch mount: expected 1 view payloads, got 0',
      }));
    }
  });
});

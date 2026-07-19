import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { FakeHistoryProvider } from '../../core/history/fake-provider';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

describe('AuraRoutingEngine.commitHistoryIfNeeded', () => {
  it('writes URL once for push navigation without emitting url-aligned', () => {
    const onEvent = jest.fn();
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    engine.events.subscribe(onEvent);
    const from = createMatchedRoute('/from');
    const to = createMatchedRoute('/to');
    const tx = new NavigationTransaction(
      1,
      {
        from,
        to,
        action: 'push',
        href: '/to',
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);
    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/to');
    expect(tx.historyCommitted).toBe(true);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('skips history write for pop navigation', () => {
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    const to = createMatchedRoute('/to');
    const tx = new NavigationTransaction(
      1,
      {
        from: createMatchedRoute('/from'),
        to,
        action: 'pop',
        href: '/to',
        hash: '',
        options: { replace: true, syncHistory: false },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/from');
    expect(tx.historyCommitted).toBe(false);
  });

  it('skips history when from and to are the same navigation target', () => {
    const provider = new FakeHistoryProvider('/users/1');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    const route = createMatchedRoute('/users/1');
    const tx = new NavigationTransaction(
      1,
      {
        from: route,
        to: route,
        action: 'push',
        href: '/users/1',
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/users/1');
    expect(tx.historyCommitted).toBe(false);
  });

  it('writes URL for replace navigation', () => {
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    const tx = new NavigationTransaction(
      1,
      {
        from: createMatchedRoute('/from'),
        to: createMatchedRoute('/to'),
        action: 'replace',
        href: '/to',
        hash: '',
        options: { replace: true, syncHistory: true },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/to');
    expect(provider.entries).toEqual(['/to']);
    expect(tx.historyCommitted).toBe(true);
  });

  it('skips history when syncHistory is false', () => {
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    const tx = new NavigationTransaction(
      1,
      {
        from: createMatchedRoute('/from'),
        to: createMatchedRoute('/to'),
        action: 'push',
        href: '/to',
        hash: '',
        options: { replace: false, syncHistory: false },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/from');
    expect(tx.historyCommitted).toBe(false);
  });
});

describe('AuraRoutingEngine.notifyUrlAligned', () => {
  it('emits url-aligned after history write', () => {
    const onEvent = jest.fn();
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    engine.events.subscribe(onEvent);
    const from = createMatchedRoute('/from');
    const to = createMatchedRoute('/to');
    const tx = new NavigationTransaction(
      1,
      {
        from,
        to,
        action: 'push',
        href: '/to',
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);
    engine.notifyUrlAligned(tx);

    expect(onEvent).toHaveBeenCalledWith({
      type: 'navigation:url-aligned',
      id: 1,
      from,
      to,
      action: 'push',
      hash: '',
      source: 'write',
    });
  });

  it('emits url-aligned for pop without writing history', () => {
    const onEvent = jest.fn();
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    engine.events.subscribe(onEvent);
    const to = createMatchedRoute('/to');
    const tx = new NavigationTransaction(
      1,
      {
        from: createMatchedRoute('/from'),
        to,
        action: 'pop',
        href: '/to',
        hash: '',
        options: { replace: true, syncHistory: false },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);
    engine.notifyUrlAligned(tx);

    expect(provider.currentHref).toBe('/from');
    expect(tx.historyCommitted).toBe(false);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'navigation:url-aligned',
      id: 1,
      from: tx.from,
      to,
      action: 'pop',
      hash: '',
      source: 'browser',
    });
  });

  it('emits url-aligned with browser source on system boot', () => {
    const onEvent = jest.fn();
    const provider = new FakeHistoryProvider('/features/animations/b');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    engine.events.subscribe(onEvent);
    const to = createMatchedRoute('/features/animations/b');
    const tx = new NavigationTransaction(
      1,
      {
        from: null,
        to,
        action: 'system',
        href: '/features/animations/b',
        hash: '',
        options: { replace: true, syncHistory: false },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);
    engine.notifyUrlAligned(tx);

    expect(tx.historyCommitted).toBe(false);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigation:url-aligned',
        source: 'browser',
        action: 'system',
      }),
    );
  });

  it('does not emit when push did not write history', () => {
    const onEvent = jest.fn();
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    engine.events.subscribe(onEvent);
    const tx = new NavigationTransaction(
      1,
      {
        from: createMatchedRoute('/from'),
        to: createMatchedRoute('/to'),
        action: 'push',
        href: '/to',
        hash: '',
        options: { replace: false, syncHistory: false },
      },
      () => false,
      engine,
    );

    engine.commitHistoryIfNeeded(tx);
    engine.notifyUrlAligned(tx);

    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('AuraRoutingEngine finalize after early history', () => {
  it('finalizeCancelled preserves URL on push when history was committed', () => {
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });
    const tx = new NavigationTransaction(
      1,
      {
        from: createMatchedRoute('/from'),
        to: createMatchedRoute('/to'),
        action: 'push',
        href: '/to',
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );
    engine.commitHistoryIfNeeded(tx);

    engine.finalizeCancelled(tx);

    expect(provider.currentHref).toBe('/to');
  });
});

import type { HistoryAction, NavigateHistoryOptions } from '../../core/history/provider.types';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { collectEngineEvents } from '../_helpers/collect-navigation-errors';
import {
  createMatchedRoute,
  createNavigationTransaction,
} from '../_helpers/create-mock-transaction';
import { createEngineHarness } from '../_helpers/engine-harness';

function harness(href: string) {
  return createEngineHarness({ href });
}

function makeTx(
  engine: ReturnType<typeof harness>['engine'],
  options: {
    from?: MatchedRouteInfo | null;
    to: MatchedRouteInfo;
    action?: HistoryAction;
    href?: string;
    id?: number;
    options?: NavigateHistoryOptions;
  },
) {
  return createNavigationTransaction({
    engine,
    id: options.id,
    from: options.from ?? null,
    to: options.to,
    action: options.action ?? 'push',
    href: options.href ?? options.to.href,
    options: options.options,
  });
}

describe('AuraRoutingEngine.commitHistoryIfNeeded', () => {
  it('writes URL once for push navigation without emitting url-aligned', () => {
    const onEvent = jest.fn();
    const { engine, provider } = harness('/from');
    engine.events.subscribe(onEvent);
    const from = createMatchedRoute('/from');
    const to = createMatchedRoute('/to');
    const tx = makeTx(engine, { from, to, href: '/to' });

    engine.commitHistoryIfNeeded(tx);
    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/to');
    expect(tx.historyCommitted).toBe(true);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('skips history write for pop navigation', () => {
    const { engine, provider } = harness('/from');
    const to = createMatchedRoute('/to');
    const tx = makeTx(engine, {
      from: createMatchedRoute('/from'),
      to,
      action: 'pop',
      href: '/to',
      options: { replace: true, syncHistory: false },
    });

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/from');
    expect(tx.historyCommitted).toBe(false);
  });

  it('skips history when from and to are the same navigation target', () => {
    const { engine, provider } = harness('/users/1');
    const route = createMatchedRoute('/users/1');
    const tx = makeTx(engine, { from: route, to: route, href: '/users/1' });

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/users/1');
    expect(tx.historyCommitted).toBe(false);
  });

  it('writes URL for replace navigation', () => {
    const { engine, provider } = harness('/from');
    const tx = makeTx(engine, {
      from: createMatchedRoute('/from'),
      to: createMatchedRoute('/to'),
      action: 'replace',
      href: '/to',
      options: { replace: true, syncHistory: true },
    });

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/to');
    expect(provider.entries).toEqual(['/to']);
    expect(tx.historyCommitted).toBe(true);
  });

  it('skips history when syncHistory is false', () => {
    const { engine, provider } = harness('/from');
    const tx = makeTx(engine, {
      from: createMatchedRoute('/from'),
      to: createMatchedRoute('/to'),
      href: '/to',
      options: { replace: false, syncHistory: false },
    });

    engine.commitHistoryIfNeeded(tx);

    expect(provider.currentHref).toBe('/from');
    expect(tx.historyCommitted).toBe(false);
  });
});

describe('AuraRoutingEngine.notifyUrlAligned', () => {
  it('emits url-aligned after history write', () => {
    const onEvent = jest.fn();
    const { engine } = harness('/from');
    engine.events.subscribe(onEvent);
    const from = createMatchedRoute('/from');
    const to = createMatchedRoute('/to');
    const tx = makeTx(engine, { from, to, href: '/to' });

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
    const { engine, provider } = harness('/from');
    engine.events.subscribe(onEvent);
    const to = createMatchedRoute('/to');
    const tx = makeTx(engine, {
      from: createMatchedRoute('/from'),
      to,
      action: 'pop',
      href: '/to',
      options: { replace: true, syncHistory: false },
    });

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
    const { engine } = harness('/features/animations/b');
    engine.events.subscribe(onEvent);
    const to = createMatchedRoute('/features/animations/b');
    const tx = makeTx(engine, {
      from: null,
      to,
      action: 'system',
      href: '/features/animations/b',
      options: { replace: true, syncHistory: false },
    });

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
    const { engine } = harness('/from');
    engine.events.subscribe(onEvent);
    const tx = makeTx(engine, {
      from: createMatchedRoute('/from'),
      to: createMatchedRoute('/to'),
      href: '/to',
      options: { replace: false, syncHistory: false },
    });

    engine.commitHistoryIfNeeded(tx);
    engine.notifyUrlAligned(tx);

    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('AuraRoutingEngine finalize after early history', () => {
  it('applyTerminalOutcome(cancelled) preserves URL on push when history was committed', () => {
    const { engine, provider } = harness('/from');
    const tx = makeTx(engine, {
      from: createMatchedRoute('/from'),
      to: createMatchedRoute('/to'),
      href: '/to',
    });
    engine.commitHistoryIfNeeded(tx);

    engine.applyTerminalOutcome({ status: 'cancelled' }, tx);

    expect(provider.currentHref).toBe('/to');
  });
});

describe('AuraRoutingEngine.restoreCommittedNavState', () => {
  it('rolls back URL and emits nav-state-restore when pending already wrote history', () => {
    const { engine, provider } = harness('/about');

    const about = createMatchedRoute('/about');
    const gallery = createMatchedRoute('/gallery');
    engine.commitNavigation(
      makeTx(engine, {
        from: null,
        to: about,
        action: 'system',
        href: '/about',
        options: { replace: true, syncHistory: false },
      }),
    );

    const pending = makeTx(engine, {
      id: 2,
      from: about,
      to: gallery,
      href: '/gallery',
    });
    engine.commitHistoryIfNeeded(pending);
    expect(provider.currentHref).toBe('/gallery');

    const seen = collectEngineEvents(engine);
    engine.restoreCommittedNavState(pending);

    expect(provider.currentHref).toBe('/about');
    expect(seen).toEqual([{ type: 'navigation:nav-state-restore', to: about }]);
  });

  it('emits nav-state-restore without rollback when pending did not write history', () => {
    const { engine, provider } = harness('/about');

    const about = createMatchedRoute('/about');
    engine.commitNavigation(
      makeTx(engine, {
        from: null,
        to: about,
        action: 'system',
        href: '/about',
        options: { replace: true, syncHistory: false },
      }),
    );

    const seen = collectEngineEvents(engine);
    engine.restoreCommittedNavState(null);

    expect(provider.currentHref).toBe('/about');
    expect(seen).toEqual([{ type: 'navigation:nav-state-restore', to: about }]);
  });
});

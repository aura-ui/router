import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { EventBus } from '../../core/events';
import type { EngineEvent } from '../../core/events';
import { NavigationFailure } from '../../core/failure';
import { NavigationError } from '../../core/failure/navigation-error';
import { FakeHistoryProvider } from '../../core/history/fake-provider';
import { NavigationPulse } from '../../core/navigation/navigation-pulse';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { finalizeTransitionPlan } from '../../core/route-tree/transition-plan';
import {
  createMatchedRoute,
  createMockTransaction,
} from '../helpers/create-mock-transaction';

function types(events: EngineEvent[]): EngineEvent['type'][] {
  return events.map((e) => e.type);
}

describe('NavigationPulse', () => {
  it('begin emits navigation:start then node:deactivate for exit routes', () => {
    const seen: EngineEvent[] = [];
    const bus = new EventBus();
    bus.subscribe((e) => seen.push(e));
    const pulse = new NavigationPulse(bus);
    const tx = createMockTransaction({
      from: createMatchedRoute('/a'),
      exitRoutes: [createMatchedRoute('/a')],
      enterRoutes: [createMatchedRoute('/b')],
    });

    pulse.begin(tx);

    expect(types(seen)).toEqual(['navigation:start', 'node:deactivate']);
    expect(seen[1]).toMatchObject({ nodeId: '/a', pattern: '/a' });
  });

  it('alignUrl no-ops for push before history write', () => {
    const listener = jest.fn();
    const bus = new EventBus();
    bus.subscribe(listener);
    const pulse = new NavigationPulse(bus);
    const tx = createMockTransaction({
      enterRoutes: [createMatchedRoute('/b')],
    });
    tx.historyCommitted = false;

    pulse.alignUrl(tx);

    expect(listener).not.toHaveBeenCalled();
  });

  it('alignUrl emits write source after historyCommitted', () => {
    const seen: EngineEvent[] = [];
    const bus = new EventBus();
    bus.subscribe((e) => seen.push(e));
    const pulse = new NavigationPulse(bus);
    const tx = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
    });
    tx.historyCommitted = true;

    pulse.alignUrl(tx);

    expect(seen).toEqual([
      expect.objectContaining({
        type: 'navigation:url-aligned',
        source: 'write',
        action: 'push',
      }),
    ]);
  });

  it('commitEnd emits commit:end then node:activate', () => {
    const seen: EngineEvent[] = [];
    const bus = new EventBus();
    bus.subscribe((e) => seen.push(e));
    const pulse = new NavigationPulse(bus);
    const tx = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
    });

    pulse.commitEnd(tx);

    expect(types(seen)).toEqual(['navigation:commit:end', 'node:activate']);
    expect(seen[1]).toMatchObject({ nodeId: '/b', pattern: '/b' });
  });

  it('loadEnd emits load:error only for status error', () => {
    const seen: EngineEvent[] = [];
    const bus = new EventBus();
    bus.subscribe((e) => seen.push(e));
    const pulse = new NavigationPulse(bus);
    const to = createMatchedRoute('/b');
    const tx = createMockTransaction({ enterRoutes: [to] });
    const failure = NavigationFailure.fromPipeline(
      new NavigationError({
        code: 'LOAD_FAILED',
        phase: 'load',
        routePattern: to.pattern,
        message: 'x',
      }),
      { view: 'none', href: to.href },
      null,
      to,
      'push',
    );

    pulse.loadStart(tx, [to]);
    pulse.loadEnd(tx, [to], { status: 'cancelled' }, to);
    expect(types(seen)).toEqual(['load:start']);

    seen.length = 0;
    pulse.loadStart(tx, [to]);
    pulse.loadEnd(tx, [to], { status: 'error', failure }, to);
    expect(types(seen)).toEqual(['load:start', 'load:error']);
  });

  it('settle maps all TransactionResult statuses', () => {
    const seen: EngineEvent[] = [];
    const bus = new EventBus();
    bus.subscribe((e) => seen.push(e));
    const pulse = new NavigationPulse(bus);

    pulse.settle(1, { status: 'navigationSucceeded' });
    pulse.settle(2, { status: 'cancelled' });
    pulse.settle(3, { status: 'redirect', url: '/x', replace: true });
    const failure = NavigationFailure.notFound('/missing', null, 'push');
    pulse.settle(4, { status: 'error', failure });

    expect(types(seen)).toEqual([
      'navigation:finish',
      'navigation:cancel',
      'navigation:redirect',
      'navigation:error',
    ]);
  });

  it('engine.commitNavigation delegates commitEnd and updates prev', () => {
    const seen: EngineEvent[] = [];
    const engine = new AuraRoutingEngine(
      { navigate: jest.fn() },
      { provider: new FakeHistoryProvider('/a') },
    );
    engine.events.subscribe((e) => seen.push(e));
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b');
    const tx = new NavigationTransaction(
      7,
      {
        from,
        to,
        action: 'push',
        href: '/b',
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );
    tx.transitionPlan = finalizeTransitionPlan({
      exitRoutes: [from],
      enterRoutes: [to],
      lca: null,
      update: false,
    });

    engine.commitNavigation(tx);

    expect(types(seen)).toEqual(['navigation:commit:end', 'node:activate']);
    expect(engine.prev).toBe(to);
  });
});

import { EventBus } from '../../core/events';
import type { EngineEvent } from '../../core/events';
import { NavigationFailure } from '../../core/failure';
import { NavigationError } from '../../core/failure/navigation-error';
import { NavigationPulse } from '../../core/navigation/navigation-pulse';
import { eventTypes } from '../_helpers/collect-navigation-errors';
import {
  createMatchedRoute,
  createMockTransaction,
  createNavigationTransaction,
} from '../_helpers/create-mock-transaction';
import { createEngineHarness } from '../_helpers/engine-harness';

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

    expect(eventTypes(seen)).toEqual(['navigation:start', 'node:deactivate']);
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

  it('restoreNavState emits navigation:nav-state-restore', () => {
    const seen: EngineEvent[] = [];
    const bus = new EventBus();
    bus.subscribe((e) => seen.push(e));
    const pulse = new NavigationPulse(bus);
    const to = createMatchedRoute('/about');

    pulse.restoreNavState(to);

    expect(seen).toEqual([{ type: 'navigation:nav-state-restore', to }]);
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

    expect(eventTypes(seen)).toEqual(['navigation:commit:end', 'node:activate']);
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
    expect(eventTypes(seen)).toEqual(['load:start']);

    seen.length = 0;
    pulse.loadStart(tx, [to]);
    pulse.loadEnd(tx, [to], { status: 'error', failure }, to);
    expect(eventTypes(seen)).toEqual(['load:start', 'load:error']);
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

    expect(eventTypes(seen)).toEqual([
      'navigation:finish',
      'navigation:cancel',
      'navigation:redirect',
      'navigation:error',
    ]);
  });

  it('engine.commitNavigation delegates commitEnd and updates prev', () => {
    const { engine } = createEngineHarness({ href: '/a' });
    const seen: EngineEvent[] = [];
    engine.events.subscribe((e) => seen.push(e));
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b');
    const tx = createNavigationTransaction({
      engine,
      id: 7,
      from,
      to,
      href: '/b',
      exitRoutes: [from],
      enterRoutes: [to],
      transitionOrder: null,
    });

    engine.commitNavigation(tx);

    expect(eventTypes(seen)).toEqual(['navigation:commit:end', 'node:activate']);
    expect(engine.prev).toBe(to);
  });
});

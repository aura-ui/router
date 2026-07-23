import { EventBus } from '../../core/events';
import type { EngineEvent } from '../../core/events';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';

describe('EventBus', () => {
  it('delivers events to subscribers in subscription order', () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe(() => order.push('a'));
    bus.subscribe(() => order.push('b'));

    const to = createMatchedRoute('/to');
    bus.emit({
      type: 'navigation:url-aligned',
      id: 1,
      from: null,
      to,
      action: 'system',
      hash: '',
      source: 'browser',
    });

    expect(order).toEqual(['a', 'b']);
  });

  it('unsubscribe stops further delivery', () => {
    const bus = new EventBus();
    const seen: EngineEvent['type'][] = [];
    const unsubscribe = bus.subscribe((event) => seen.push(event.type));

    bus.emit({ type: 'navigation:finish', id: 1 });
    unsubscribe();
    bus.emit({ type: 'navigation:finish', id: 2 });

    expect(seen).toEqual(['navigation:finish']);
  });

  it('emit is synchronous (listener runs before emit returns)', () => {
    const bus = new EventBus();
    let duringEmit = false;
    bus.subscribe(() => {
      duringEmit = true;
    });

    expect(duringEmit).toBe(false);
    bus.emit({ type: 'navigation:finish', id: 1 });
    expect(duringEmit).toBe(true);
  });

  it('destroy clears listeners', () => {
    const bus = new EventBus();
    const listener = jest.fn();
    bus.subscribe(listener);
    bus.destroy();

    bus.emit({ type: 'navigation:finish', id: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});

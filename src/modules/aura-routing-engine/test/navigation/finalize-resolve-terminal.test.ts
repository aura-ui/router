import { AuraRoutingEngine, FakeHistoryProvider } from '../../core';
import type { RouterInstance } from '../../core';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

describe('AuraRoutingEngine.finalizeResolveTerminal', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  function setup() {
    const provider = new FakeHistoryProvider('/from');
    const engine = new AuraRoutingEngine(router, { provider });
    engine.isRunning = true;
    const seen: string[] = [];
    engine.events.subscribe((event) => seen.push(event.type));
    const applySpy = jest.spyOn(engine, 'applyTerminalOutcome');
    const probe = new NavigationTransaction(
      0,
      {
        from: createMatchedRoute('/from'),
        to: createMatchedRoute('/to'),
        href: '/to',
        hash: '',
        action: 'push',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );
    return { engine, seen, applySpy, probe };
  }

  it('settles cancel then applies', () => {
    const { engine, seen, applySpy, probe } = setup();
    engine.finalizeResolveTerminal({ status: 'cancelled' }, probe);
    expect(seen).toEqual(['navigation:cancel']);
    expect(applySpy).toHaveBeenCalledWith({ status: 'cancelled' }, probe);
  });

  it('settles redirect then applies', () => {
    const { engine, seen, applySpy, probe } = setup();
    const redirect = { status: 'redirect' as const, url: '/login', replace: true };
    engine.finalizeResolveTerminal(redirect, probe);
    expect(seen).toEqual(['navigation:redirect']);
    expect(applySpy).toHaveBeenCalledWith(redirect, probe);
  });
});

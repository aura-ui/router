import {
  createMatchedRoute,
  createNavigationTransaction,
} from '../_helpers/create-mock-transaction';
import { createEngineHarness } from '../_helpers/engine-harness';

describe('AuraRoutingEngine.finalizeResolveTerminal', () => {
  function setup() {
    const { engine } = createEngineHarness({ href: '/from' });
    engine.isRunning = true;
    const seen: string[] = [];
    engine.events.subscribe((event) => seen.push(event.type));
    const applySpy = jest.spyOn(engine, 'applyTerminalOutcome');
    const probe = createNavigationTransaction({
      engine,
      id: 0,
      from: createMatchedRoute('/from'),
      to: createMatchedRoute('/to'),
      href: '/to',
    });
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

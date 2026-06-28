import {
  AuraRoutingEngine,
  FakeHistoryProvider,
  type AuraRoutingProcessor,
} from '../core';
import { createDomRoute, collectRoutesFromDom } from './helpers/test-route-dom';
import type { RouterInstance } from '../core/hooks/types';

function createMockProcessor() {
  return {
    run: jest.fn().mockImplementation(async (input: { commitGate?: () => void }) => {
      input.commitGate?.();
      return { status: 'navigationSucceeded' };
    }),
    stop: jest.fn(),
    invalidate: jest.fn(),
    abortPendingNavigation: jest.fn(),
  } as unknown as AuraRoutingProcessor;
}

describe('AuraRoutingEngine + route tree', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('flat route match produces single-node chain', async () => {
    const processor = createMockProcessor();
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(processor, router, { provider });

    engine.replaceRoutes(collectRoutesFromDom(createDomRoute('/'), createDomRoute('/about')));
    provider.start();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    const { to } = processor.run.mock.calls[0]![0] as { to: { chain?: { pattern: string }[] } };
    expect(to.chain?.map((entry) => entry.pattern)).toEqual(['/about']);
  });

  it('nested navigation passes branch chains to processor', async () => {
    const processor = createMockProcessor();
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(processor, router, { provider });

    const profile = createDomRoute('profile');
    const security = createDomRoute('security');
    const settings = createDomRoute('/settings', [profile, security]);

    engine.replaceRoutes(collectRoutesFromDom(settings));
    provider.start();

    await engine.navigateTo('/settings/profile', 'push', { replace: false, syncHistory: true });
    await engine.navigateTo('/settings/security', 'push', { replace: false, syncHistory: true });

    const firstTo = processor.run.mock.calls[0]![0].to;
    expect(firstTo.chain?.map((entry: { pattern: string }) => entry.pattern)).toEqual([
      '/settings',
      '/settings/profile',
    ]);

    const second = processor.run.mock.calls[1]![0];
    expect(second.from.chain?.map((entry: { pattern: string }) => entry.pattern)).toEqual([
      '/settings',
      '/settings/profile',
    ]);
    expect(second.to.chain?.map((entry: { pattern: string }) => entry.pattern)).toEqual([
      '/settings',
      '/settings/security',
    ]);
  });
});

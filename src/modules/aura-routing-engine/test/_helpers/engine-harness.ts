import type { AuraRoute } from '../../../aura-route/core/aura-route';
import {
  AuraRoutingEngine,
  FakeHistoryProvider,
  type RouterInstance,
} from '../../core';
import type { AuraRoutingEngineConfig } from '../../core/aura-routing-engine-config';

import { collectRoutesFromDom } from './test-route-dom';

export type CreateEngineHarnessOptions = AuraRoutingEngineConfig & {
  /** Initial provider href. Default: `'/'`. */
  href?: string;
  /** Register via {@link AuraRoutingEngine.registerRoutes}. */
  routes?: AuraRoute[];
  /** Replace via {@link AuraRoutingEngine.replaceRoutes} + {@link collectRoutesFromDom}. */
  domRoutes?: AuraRoute[];
  /** Default: `true`. */
  startProvider?: boolean;
  router?: RouterInstance;
  /** Override provider; defaults to {@link FakeHistoryProvider}. */
  provider?: FakeHistoryProvider;
};

export type EngineHarness = {
  engine: AuraRoutingEngine;
  provider: FakeHistoryProvider;
  router: RouterInstance;
};

/** Real engine + FakeHistoryProvider with optional route registration. */
export function createEngineHarness(
  options: CreateEngineHarnessOptions = {},
): EngineHarness {
  const {
    href = '/',
    routes,
    domRoutes,
    startProvider = true,
    router = { navigate: jest.fn() },
    provider = new FakeHistoryProvider(href),
    ...config
  } = options;

  const engine = new AuraRoutingEngine(router, { ...config, provider });

  if (routes?.length) {
    engine.registerRoutes(routes);
  }
  if (domRoutes?.length) {
    engine.replaceRoutes(collectRoutesFromDom(...domRoutes));
  }
  if (startProvider) {
    provider.start();
  }

  return { engine, provider, router };
}

/** Boot engine to `href` without syncing history (typical test prelude). */
export async function bootEngine(
  engine: AuraRoutingEngine,
  href: string,
): Promise<void> {
  await engine.navigateTo(href, 'system', { replace: true, syncHistory: false });
}

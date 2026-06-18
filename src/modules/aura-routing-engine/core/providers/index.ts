import { RoutingProviderRegistry } from '../provider-registry';
import { createInternalProvider } from './internal-provider';
import { createNavigoProvider } from './navigo-provider';
import type { NavigoProviderConfig } from './navigo-config';

/** Register built-in routing providers (`'internal'`, `'navigo'`, …). */
export function registerBuiltInProviders(): void {
  RoutingProviderRegistry.register('internal', (config) => createInternalProvider(config));

  RoutingProviderRegistry.register('navigo', (config) =>
    createNavigoProvider(config as NavigoProviderConfig),
  );
}

export { InternalProvider, createInternalProvider } from './internal-provider';
export { NavigoProvider, createNavigoProvider } from './navigo-provider';
export type { NavigoProviderConfig, NavigoRoutingStrategy } from './navigo-config';

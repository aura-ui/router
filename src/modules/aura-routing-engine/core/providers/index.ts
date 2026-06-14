import { RoutingProviderRegistry } from '../provider-registry';
import { createNavigoProvider } from './navigo-provider';
import type { NavigoProviderConfig } from './navigo-config';

/** Register built-in routing providers (`'navigo'`, …). Called once from `core.ts`. */
export function registerBuiltInProviders(): void {
  RoutingProviderRegistry.register('navigo', (config) =>
    createNavigoProvider(config as NavigoProviderConfig),
  );
}

export { NavigoProvider, createNavigoProvider } from './navigo-provider';
export type { NavigoProviderConfig, NavigoRoutingStrategy } from './navigo-config';

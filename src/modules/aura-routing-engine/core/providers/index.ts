import { RoutingProviderRegistry } from '../provider-registry';
import { createNavigoProvider } from './navigo-provider';
import type { NavigoProviderConfig } from './navigo-config';

RoutingProviderRegistry.register('navigo', (config) => createNavigoProvider(config as NavigoProviderConfig));

export { NavigoProvider, createNavigoProvider } from './navigo-provider';
export type { NavigoProviderConfig, NavigoRoutingStrategy } from './navigo-config';

import type { RoutingEngineConfig } from '../types';

/**
 * Navigo-specific configuration.
 * Passed entirely to `RoutingProviderRegistry.create('navigo', config)`.
 */
export type NavigoRoutingStrategy = 'ONE' | 'ALL';

export interface NavigoProviderConfig extends RoutingEngineConfig {
  /** Base path passed to Navigo. Default: `'/'`. */
  root?: string;
  strategy?: NavigoRoutingStrategy;
  noMatchWarning?: boolean;
}

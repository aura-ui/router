import type { RoutingEngineConfig } from './types';
import type { RoutingEngineProvider, RoutingProviderFactory } from './provider';

const providers = new Map<string, RoutingProviderFactory>();

export class RoutingProviderRegistry {
  static register<T extends RoutingEngineConfig = RoutingEngineConfig>(
    id: string,
    factory: RoutingProviderFactory<T>,
  ): void {
    if (!id) {
      console.warn('Routing provider id must be a non-empty string — skipping registration');
      return;
    }

    if (providers.has(id)) {
      console.warn(`Routing provider "${id}" is already registered — overwriting`);
    }
    providers.set(id, factory as RoutingProviderFactory);
  }

  static create<T extends RoutingEngineConfig = RoutingEngineConfig>(
    id: string,
    config: T = {} as T,
  ): RoutingEngineProvider {
    const factory = providers.get(id);
    if (!factory) {
      throw new Error(
        `Unknown routing provider "${id}". Registered: ${[...providers.keys()].join(', ') || 'none'}`,
      );
    }
    return factory(config);
  }

  static has(id: string): boolean {
    return providers.has(id);
  }

  static ids(): string[] {
    return [...providers.keys()];
  }
}

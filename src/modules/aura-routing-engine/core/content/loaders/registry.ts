import { createBuiltinLoaders } from './builtins';
import type { LoaderFn, LoaderTransport, LoaderType } from '../model/types';
import { fetchText, resolveRelativeUrl } from '../transport/http';

const defaultTransport: LoaderTransport = {
  fetchText,
  resolveUrl: resolveRelativeUrl,
};

/**
 * Content loader registry.
 * Built-in types are defined in {@link createBuiltinLoaders} (`./builtins.ts`).
 */
export class LoaderRegistry {
  private readonly loaders = new Map<string, LoaderFn>();

  constructor(builtins: ReadonlyArray<{ type: string; load: LoaderFn }> = createBuiltinLoaders(defaultTransport)) {
    for (const entry of builtins) {
      this.loaders.set(entry.type, entry.load);
    }
  }

  register(type: LoaderType, loader: LoaderFn): void {
    if (this.loaders.has(type)) {
      console.warn(`Content loader "${type}" is already registered — overwriting`);
    }

    this.loaders.set(type, loader);
  }

  get(type: LoaderType): LoaderFn {
    const loader = this.loaders.get(type);
    if (!loader) {
      const known = [...this.loaders.keys()].join(', ') || 'none';
      throw new Error(`Unknown content loader "${type}". Registered: ${known}`);
    }
    return loader;
  }
}

export const defaultLoaderRegistry = new LoaderRegistry();

export function createLoaderRegistry(transport: LoaderTransport): LoaderRegistry {
  return new LoaderRegistry(createBuiltinLoaders(transport));
}

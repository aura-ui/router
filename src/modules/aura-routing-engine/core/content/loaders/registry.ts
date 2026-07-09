import { createBuiltinLoaders } from './builtins';
import type { LoaderFn, LoaderTransport, LoaderId } from '../model/types';
import { fetchText, resolveRelativeUrl } from '../transport/http';

const defaultTransport: LoaderTransport = {
  fetchText,
  resolveUrl: resolveRelativeUrl,
};

export class LoaderRegistry {
  private readonly loaders = new Map<string, LoaderFn>();

  constructor(builtins: ReadonlyArray<{ loader: string; load: LoaderFn }> = createBuiltinLoaders(defaultTransport)) {
    for (const entry of builtins) {
      this.loaders.set(entry.loader, entry.load);
    }
  }

  register(loaderId: LoaderId, loader: LoaderFn): void {
    if (this.loaders.has(loaderId)) {
      console.warn(`Content loader "${loaderId}" is already registered — overwriting`);
    }

    this.loaders.set(loaderId, loader);
  }

  get(loaderId: LoaderId): LoaderFn {
    const loader = this.loaders.get(loaderId);
    if (!loader) {
      const known = [...this.loaders.keys()].join(', ') || 'none';
      throw new Error(`Unknown content loader "${loaderId}". Registered: ${known}`);
    }
    return loader;
  }
}

export const defaultLoaderRegistry = new LoaderRegistry();

export function createLoaderRegistry(transport: LoaderTransport): LoaderRegistry {
  return new LoaderRegistry(createBuiltinLoaders(transport));
}

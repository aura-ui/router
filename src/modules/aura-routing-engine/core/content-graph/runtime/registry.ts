import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import type { ContentEnvironment, LoadContext, ViewPayload } from '../model/types';
import { Loader, FnLoader } from './loader';
import { createDefaultLoaders } from './manifest';
import { createBrowserEnvironment, defaultEnvironment } from './environment';

export class LoaderRegistry {
  private readonly env: ContentEnvironment;
  private readonly loaders = new Map<string, Loader>();

  constructor(
    env: ContentEnvironment = defaultEnvironment,
    loaders: readonly Loader[] = createDefaultLoaders(env),
  ) {
    this.env = env;
    for (const loader of loaders) {
      this.set(loader);
    }
  }

  register(loader: Loader): void {
    this.set(loader);
  }

  registerFn(
    type: LoaderType,
    run: (ctx: LoadContext) => Promise<ViewPayload | null>,
  ): void {
    this.set(
      new FnLoader(this.env, type, async (ctx) => {
        const payload = await run(ctx);
        if (payload == null) return null;
        if (typeof payload === 'string') return { kind: 'html', html: payload };
        return { kind: 'fragment', node: payload as DocumentFragment };
      }),
    );
  }

  /** @deprecated Use {@link registerFn}. */
  registerViewFn(
    type: LoaderType,
    run: (ctx: LoadContext) => Promise<ViewPayload | null>,
  ): void {
    this.registerFn(type, run);
  }

  has(type: LoaderType): boolean {
    return this.loaders.has(type);
  }

  get(type: LoaderType): Loader {
    const loader = this.loaders.get(type);
    if (!loader) {
      const known = [...this.loaders.keys()].join(', ') || 'none';
      throw new Error(`Unknown content loader "${type}". Registered: ${known}`);
    }
    return loader;
  }

  getEnvironment(): ContentEnvironment {
    return this.env;
  }

  private set(loader: Loader): void {
    if (this.loaders.has(loader.type)) {
      console.warn(`Content loader "${loader.type}" is already registered — overwriting`);
    }
    this.loaders.set(loader.type, loader);
  }
}

export function createLoaderRegistry(env: ContentEnvironment = createBrowserEnvironment()): LoaderRegistry {
  return new LoaderRegistry(env);
}

export const defaultLoaderRegistry = new LoaderRegistry();

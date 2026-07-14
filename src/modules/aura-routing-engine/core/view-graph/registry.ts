import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';
import type { ViewLoaderEnv, LoaderFn } from './types';
import { Loader, FnLoader, type LoaderClass } from './loader';
import { createBrowserEnvironment, defaultEnvironment } from './environment';
import { ComponentLoader } from './loaders/component';
import { HtmlLoader } from './loaders/html';
import { IframeLoader } from './loaders/iframe';
import { ImportLoader } from './loaders/import';
import { TemplateLoader } from './loaders/template';
import { UrlLoader } from './loaders/url';

const BUILTIN = [
  TemplateLoader,
  HtmlLoader,
  UrlLoader,
  ComponentLoader,
  ImportLoader,
  IframeLoader,
] as const satisfies readonly LoaderClass[];

/** Built-in and custom loaders keyed by {@link LoaderId}. See {@link defaultLoaderRegistry}. */
export class LoaderRegistry {
  private readonly env: ViewLoaderEnv;
  private readonly loaders = new Map<string, Loader>();

  constructor(
    env: ViewLoaderEnv = defaultEnvironment,
    loaders: readonly Loader[] = BUILTIN.map((C) => new C(env)),
  ) {
    this.env = env;
    loaders.forEach((loader) => this.install(loader));
  }

  /** Instance, class (`new C(env)`), or `(loaderId, fn)` → {@link FnLoader}. */
  register(loader: Loader): void;
  register(loaderClass: LoaderClass): void;
  register(loaderId: LoaderId, fn: LoaderFn, options?: any): void;
  register(loaderIdOrLoader: LoaderId | Loader | LoaderClass, fn?: LoaderFn, options?: any): void {
    if (typeof loaderIdOrLoader === 'string') {
      if (!fn) throw new TypeError(`register("${loaderIdOrLoader}") requires a loader function`);
      return this.install(new FnLoader(this.env, loaderIdOrLoader, fn, options?.needsData));
    }
    if (fn) throw new TypeError('register(loader) accepts a single argument');
    if (typeof loaderIdOrLoader === 'function') {
      if (typeof loaderIdOrLoader.type !== 'string') {
        throw new TypeError('register(fn) is invalid — use register(loaderId, fn)');
      }
      return this.install(new loaderIdOrLoader(this.env));
    }
    this.install(loaderIdOrLoader);
  }

  has(loaderId: LoaderId): boolean {
    return this.loaders.has(loaderId);
  }

  /** @throws when `loaderId` is not registered */
  get(loaderId: LoaderId): Loader {
    const loader = this.loaders.get(loaderId);
    if (!loader) {
      throw new Error(
        `Unknown view loader "${loaderId}". Registered: ${[...this.loaders.keys()].join(', ') || 'none'}`,
      );
    }
    return loader;
  }

  getEnvironment(): ViewLoaderEnv {
    return this.env;
  }

  private install(loader: Loader): void {
    this.loaders.has(loader.type) && console.warn(`View loader "${loader.type}" is already registered — overwriting`);
    this.loaders.set(loader.type, loader);
  }
}

/** Fresh registry with browser {@link ViewLoaderEnv} (tests, isolated router). */
export function createLoaderRegistry(env: ViewLoaderEnv = createBrowserEnvironment()): LoaderRegistry {
  return new LoaderRegistry(env);
}

/** Process-wide registry; mutated by {@link AuraRouter.registerLoader}. */
export const defaultLoaderRegistry = new LoaderRegistry();

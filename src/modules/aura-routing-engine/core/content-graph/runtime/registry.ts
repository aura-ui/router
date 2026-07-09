import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import type { ContentEnvironment, LoaderFn } from '../types';
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

export class LoaderRegistry {
  private readonly env: ContentEnvironment;
  private readonly loaders = new Map<string, Loader>();

  constructor(
    env: ContentEnvironment = defaultEnvironment,
    loaders: readonly Loader[] = BUILTIN.map((C) => new C(env)),
  ) {
    this.env = env;
    loaders.forEach((loader) => this.install(loader));
  }

  register(loader: Loader): void;
  register(loaderClass: LoaderClass): void;
  register(type: LoaderType, fn: LoaderFn): void;
  register(typeOrLoader: LoaderType | Loader | LoaderClass, fn?: LoaderFn): void {
    if (typeof typeOrLoader === 'string') {
      if (!fn) throw new TypeError(`register("${typeOrLoader}") requires a loader function`);
      return this.install(new FnLoader(this.env, typeOrLoader, fn));
    }
    if (fn) throw new TypeError('register(loader) accepts a single argument');
    if (typeof typeOrLoader === 'function') {
      if (typeof typeOrLoader.type !== 'string') throw new TypeError('register(fn) is invalid — use register(type, fn)');
      return this.install(new typeOrLoader(this.env));
    }
    this.install(typeOrLoader);
  }

  has(type: LoaderType): boolean {
    return this.loaders.has(type);
  }

  get(type: LoaderType): Loader {
    const loader = this.loaders.get(type);
    if (!loader) {
      throw new Error(`Unknown content loader "${type}". Registered: ${[...this.loaders.keys()].join(', ') || 'none'}`);
    }
    return loader;
  }

  getEnvironment(): ContentEnvironment {
    return this.env;
  }

  private install(loader: Loader): void {
    this.loaders.has(loader.type) && console.warn(`Content loader "${loader.type}" is already registered — overwriting`);
    this.loaders.set(loader.type, loader);
  }
}

export function createLoaderRegistry(env: ContentEnvironment = createBrowserEnvironment()): LoaderRegistry {
  return new LoaderRegistry(env);
}

export const defaultLoaderRegistry = new LoaderRegistry();

import type { LoaderFn, LoaderType } from './types';
import {
  loadComponent,
  loadComponentSrc,
  loadHtml,
  loadHtmlSrc,
  loadTemplate,
} from './loaders';

const BUILTINS: Record<string, LoaderFn> = {
  template: loadTemplate,
  html: loadHtml,
  'html-src': loadHtmlSrc,
  component: loadComponent,
  'component-src': loadComponentSrc,
};

export class LoaderRegistry {
  private readonly loaders = new Map<string, LoaderFn>(Object.entries(BUILTINS));

  register(type: LoaderType, loader: LoaderFn): void {
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

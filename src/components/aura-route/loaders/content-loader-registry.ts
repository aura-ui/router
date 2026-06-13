import { HtmlLoader } from './html-loader';
import { HtmlSrcLoader } from './html-src-loader';
import { ComponentSrcLoader } from './component-src-loader';
import { ComponentLoader } from './component-loader';
import { TemplateLoader } from './template-loader';
import type { BaseLoader } from './base-loader';
import type { ContentLoaderService } from './content-loader-service';

export type LoaderConstructor = new (service: ContentLoaderService) => BaseLoader;

export class ContentLoaderRegistry {
  private static registry = new Map<string, LoaderConstructor>();

  static register(type: string, loaderClass: LoaderConstructor): void {
    if (this.registry.has(type)) {
      console.warn(`Content loader "${type}" is already registered — overwriting`);
    }

    this.registry.set(type, loaderClass);
  }

  static get(type: string): LoaderConstructor | undefined {
    return this.registry.get(type);
  }

  static has(type: string): boolean {
    return this.registry.has(type);
  }

  static getRegisteredTypes(): readonly string[] {
    return [...this.registry.keys()];
  }
}

ContentLoaderRegistry.register('html', HtmlLoader);
ContentLoaderRegistry.register('html-src', HtmlSrcLoader);
ContentLoaderRegistry.register('component-src', ComponentSrcLoader);
ContentLoaderRegistry.register('component', ComponentLoader);
ContentLoaderRegistry.register('template', TemplateLoader);

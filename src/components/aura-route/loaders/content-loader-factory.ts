import { HtmlLoader } from './html-loader';
import { HtmlSrcLoader } from './html-src-loader';
import { ComponentSrcLoader } from './component-src-loader';
import { ComponentLoader } from './component-loader';
import { ContentLoaderService } from './content-loader-service';
import type { BaseLoader, BaseLoaderInterface } from './base-loader';
import { TemplateLoader } from './template-loader';

export type AURARouteContentType = 'html' | 'html-src' | 'template' | 'component' | 'component-src';

interface BaseLoaderConstructor {
  new(service: ContentLoaderService): BaseLoader;
}

const loaderClasses: Record<string, BaseLoaderConstructor> = {};

export const auraRouteLoaders = {
  get: (type: string) => {
    return loaderClasses[type];
  },
  define: (type: string, loaderClass: BaseLoaderConstructor): void => {
    loaderClasses[type] = loaderClass;
  },
};

export class ContentLoaderFactory {
  //private loaderClasses: Record<string, BaseLoaderConstructor> = {};

  private readonly service: ContentLoaderService;

  //private static instance: ContentLoaderFactory;


  constructor(service: ContentLoaderService) {
    //  if (ContentLoaderFactory.instance) {
    //  return ContentLoaderFactory.instance;
    // }

    this.service = service;

    // Регистрация стандартных загрузчиков
    this.registerLoader('html', HtmlLoader);
    this.registerLoader('html-src', HtmlSrcLoader);
    this.registerLoader('component-src', ComponentSrcLoader);
    this.registerLoader('component', ComponentLoader);
    this.registerLoader('template', TemplateLoader);

    //ContentLoaderFactory.instance = this;
  }

  /**
   * Регистрация кастомного загрузчика
   */
  registerLoader(type: AURARouteContentType, loaderClass: BaseLoaderConstructor): void {
    auraRouteLoaders.define(type, loaderClass);
  }

  /**
   * Создание загрузчика по типу
   */
  createLoader(
    type: string,
    content: string,
    options?: any,
  ): BaseLoaderInterface {
    const LoaderClass = auraRouteLoaders.get(type);//this.loaderClasses[type];
    if (!LoaderClass) {
      throw new Error(`Unsupported loader type: ${type}`);
    }

    const instance = new LoaderClass(this.service);

    return {
      get type(): AURARouteContentType {
        return instance.type;
      },
      load: () => instance.load(content, options),
    };
  }
}

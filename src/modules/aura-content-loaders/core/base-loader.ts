import type { AuraRouteContentType, LoaderOptions } from './types';
import type { ContentLoaderService } from './content-loader-service';

export interface BaseLoaderInterface {
  type: AuraRouteContentType;

  load(content: string, options?: LoaderOptions): Promise<string | DocumentFragment>;
}

export abstract class BaseLoader implements BaseLoaderInterface {
  protected service: ContentLoaderService;

  constructor(service: ContentLoaderService) {
    this.service = service;
  }

  abstract get type(): AuraRouteContentType;

  abstract load(content: string, options?: LoaderOptions): Promise<string | DocumentFragment>;
}

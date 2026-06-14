import type { AURARouteContentType, LoaderOptions } from './types';
import type { ContentLoaderService } from './content-loader-service';

export interface BaseLoaderInterface {
  type: AURARouteContentType;

  load(content: string, options?: LoaderOptions): Promise<string | DocumentFragment>;
}

export abstract class BaseLoader implements BaseLoaderInterface {
  protected service: ContentLoaderService;

  constructor(service: ContentLoaderService) {
    this.service = service;
  }

  abstract get type(): AURARouteContentType;

  abstract load(content: string, options?: LoaderOptions): Promise<string | DocumentFragment>;
}

import type { AURARouteContentType, LoaderOptions } from './content-loader-types';
import type { ContentLoaderService } from './content-loader-service';

export interface BaseLoaderInterface {
  type: AURARouteContentType;

  load(content: string, options?: LoaderOptions): Promise<string | DocumentFragment>;
}

// to do route content loader
export abstract class BaseLoader implements BaseLoaderInterface {
  protected service: ContentLoaderService;

  constructor(service: ContentLoaderService) {
    this.service = service;
  }

  abstract get type(): AURARouteContentType;

  abstract load(content: string, options?: LoaderOptions): Promise<string | DocumentFragment>;
}


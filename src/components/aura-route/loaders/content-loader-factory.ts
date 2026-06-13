import { ContentLoaderRegistry } from './content-loader-registry';
import type { AURARouteContentType } from './content-loader-types';
import { ContentLoaderService } from './content-loader-service';
import type { BaseLoaderInterface } from './base-loader';

export type { AURARouteContentType, BuiltInContentType } from './content-loader-types';
export type { LoaderConstructor } from './content-loader-registry';

export class ContentLoaderFactory {
  private readonly service: ContentLoaderService;

  constructor(service: ContentLoaderService) {
    this.service = service;
  }

  createLoader(
    type: string,
    content: string,
    options?: any,
  ): BaseLoaderInterface {
    const LoaderClass = ContentLoaderRegistry.get(type);

    if (!LoaderClass) {
      const registered = ContentLoaderRegistry.getRegisteredTypes().join(', ') || 'none';
      throw new Error(`Unsupported loader type: "${type}". Registered: ${registered}`);
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

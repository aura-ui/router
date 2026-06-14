import { loadAndRegisterComponent } from '../../../utils/misc/loaders';
import type { AURARouteContentType, LoaderOptions } from './content-loader-types';
import { BaseLoader } from './base-loader';

export class ComponentSrcLoader extends BaseLoader {
  static readonly type = 'component-src' as const;

  get type(): AURARouteContentType {
    return ComponentSrcLoader.type;
  }

  async load(componentPath: string, options?: LoaderOptions): Promise<string> {
    const tagName = await loadAndRegisterComponent(componentPath);
    return this.service.createComponentHtml(tagName, options?.componentOptions ?? {});
  }
}
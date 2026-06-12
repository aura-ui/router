import { loadAndRegisterComponent } from '../../../utils/misc/loaders';
import type { AURARouteContentType } from './content-loader-factory';
import { BaseLoader } from './base-loader';

export class ComponentSrcLoader extends BaseLoader {
  static readonly type = 'component-src' as const;

  get type(): AURARouteContentType {
    return ComponentSrcLoader.type;
  }

  async load(componentPath: string, options?: { componentOptions?: any }): Promise<string> {
    const tagName = await loadAndRegisterComponent(componentPath);
    return this.service.createComponentHtml(tagName, options?.componentOptions || {});
  }
}
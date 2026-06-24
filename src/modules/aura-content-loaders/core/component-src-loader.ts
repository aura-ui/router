import { loadAndRegisterComponent } from '../../aura-utils/misc';
import type { AuraRouteContentType, LoaderOptions } from './types';
import { BaseLoader } from './base-loader';

export class ComponentSrcLoader extends BaseLoader {
  static readonly type = 'component-src' as const;

  get type(): AuraRouteContentType {
    return ComponentSrcLoader.type;
  }

  async load(componentPath: string, options?: LoaderOptions): Promise<string> {
    const tagName = await loadAndRegisterComponent(componentPath);
    return this.service.createComponentHtml(tagName, options?.componentOptions ?? {});
  }
}

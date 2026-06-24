import type { AuraRouteContentType, LoaderOptions } from './types';
import { BaseLoader } from './base-loader';

export class ComponentLoader extends BaseLoader {
  static readonly type = 'component' as const;

  get type(): AuraRouteContentType {
    return ComponentLoader.type;
  }

  async load(tagName: string, options?: LoaderOptions): Promise<string> {
    if (!customElements.get(tagName)) {
      throw new Error(`Component '${tagName}' is not registered`);
    }
    return this.service.createComponentHtml(tagName, options?.componentOptions ?? {});
  }
}

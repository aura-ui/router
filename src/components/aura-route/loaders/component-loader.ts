import type { AURARouteContentType } from './content-loader-factory';
import { BaseLoader } from './base-loader';

export class ComponentLoader extends BaseLoader {
  static readonly type = 'component' as const;

  get type(): AURARouteContentType {
    return ComponentLoader.type;
  }

  async load(tagName: string, options?: { componentOptions?: any }): Promise<string> {
    if (!customElements.get(tagName)) {
      throw new Error(`Component '${tagName}' is not registered`);
    }
    return this.service.createComponentHtml(tagName, options?.componentOptions || {});
  }
}

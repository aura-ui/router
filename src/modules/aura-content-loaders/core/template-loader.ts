import type { AuraRouteContentType } from './types';
import { BaseLoader } from './base-loader';
import { getTemplate } from '../../aura-utils/misc';

export class TemplateLoader extends BaseLoader {
  static readonly type = 'template' as const;

  get type(): AuraRouteContentType {
    return TemplateLoader.type;
  }

  load(templateContent: string): Promise<DocumentFragment> {
    return getTemplate(templateContent);
  }
}

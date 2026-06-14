import type { AURARouteContentType } from './types';
import { BaseLoader } from './base-loader';
import { getTemplate } from '../../../utils/misc/dom';

export class TemplateLoader extends BaseLoader {
  static readonly type = 'template' as const;

  get type(): AURARouteContentType {
    return TemplateLoader.type;
  }

  load(templateContent: string): Promise<DocumentFragment> {
    return getTemplate(templateContent);
  }
}

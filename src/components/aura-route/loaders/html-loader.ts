import type { AURARouteContentType } from './content-loader-factory';
import { BaseLoader } from './base-loader';

export class HtmlLoader extends BaseLoader {
  static readonly type = 'html' as const;

  get type(): AURARouteContentType {
    return HtmlLoader.type;
  }

  async load(content: string): Promise<string> {
    return this.service.sanitizeHtml(content);
  }
}

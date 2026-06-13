import type { AURARouteContentType } from './content-loader-types';
import { BaseLoader } from './base-loader';

export class HtmlSrcLoader extends BaseLoader {
  static readonly type = 'html-src' as const;

  get type(): AURARouteContentType {
    return HtmlSrcLoader.type;
  }

  async load(url: string, options?: { abortController?: AbortController }): Promise<string> {
    const fullUrl = this.service.isSSR
      ? url // В SSR путь уже полный
      : `${window.location.origin}/${url}`;

    const fetched = await this.service.loadFromUrl(fullUrl, options?.abortController?.signal);
    return this.service.sanitizeHtml(fetched);
  }
}

import { processHtml } from '../../document';
import { Loader } from '../loader';
import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import type { ViewLoadContext, ViewLoadResult } from '../types';

/** `view="partials/page.html"` or `view="url::…"` — fetch; route `extract` attr selects a fragment. */
export class UrlLoader extends Loader {
  static readonly type = 'url' as const satisfies LoaderId;

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    const { content, signal, extract, route } = ctx;
    const html = await this.env.fetchText(this.env.resolveUrl(content), signal);
    const { fragment, meta } = processHtml(html, extract, route.href);
    return {
      kind: 'html',
      value: fragment,
      meta,
    };
  }
}

import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { applyHtmlExtract } from '../../../../aura-utils/misc';
import { Loader } from '../loader';
import type { ViewLoadContext, ViewLoadResult } from '../types';

/** `view="partials/page.html"` or `view="url::…"` — fetch; route `extract` attr selects a fragment. */
export class UrlLoader extends Loader {
  static readonly type = 'url' as const satisfies LoaderId;

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    const html = await this.env.fetchText(this.env.resolveUrl(ctx.content), ctx.signal);
    return { kind: 'html', value: applyHtmlExtract(html, ctx.extract) };
  }
}

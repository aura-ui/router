import { extractHtmlFragment } from '../../../../aura-utils/misc';
import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import { Loader } from '../loader';

/** `view="partials/page.html"` or `view="url::…"` — fetch; route `extract` attr selects a fragment. */
export class UrlLoader extends Loader {
  static readonly type = 'url' as const satisfies LoaderType;
  readonly type = UrlLoader.type;

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    const html = await this.env.fetchText(this.env.resolveUrl(ctx.ref), ctx.signal);
    return {
      kind: 'html',
      html: ctx.extract ? extractHtmlFragment(html, ctx.extract) : html,
    };
  }
}

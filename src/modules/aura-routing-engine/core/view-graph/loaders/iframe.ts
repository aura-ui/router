import { escapeHtml } from '../../../../aura-utils/misc';
import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import { Loader } from '../loader';

/** `view="iframe::https://…"` — lazy iframe markup (`content` is `src`). */
export class IframeLoader extends Loader {
  static readonly type = 'iframe' as const satisfies LoaderType;

  load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    return Promise.resolve({
      kind: 'markup',
      markup: `<iframe src="${escapeHtml(ctx.content)}" loading="lazy"></iframe>`,
    });
  }
}

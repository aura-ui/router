import type { ViewLoadContext, ViewLoadResult } from '../types';
import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { Loader } from '../loader';

/** `view="html::…"` — `content` is inline HTML. */
export class HtmlLoader extends Loader {
  static readonly type = 'html' as const satisfies LoaderId;

  load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    return Promise.resolve({ kind: 'html', value: ctx.content });
  }
}

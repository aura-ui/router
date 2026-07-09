import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import { Loader } from '../loader';

/** `view="html::…"` — `ref` is inline HTML. */
export class HtmlLoader extends Loader {
  static readonly type = 'html' as const satisfies LoaderType;
  readonly type = HtmlLoader.type;

  load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    return Promise.resolve({ kind: 'html', html: ctx.ref });
  }
}

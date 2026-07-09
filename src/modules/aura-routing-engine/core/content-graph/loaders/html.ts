import type { ContentResult, LoadContext } from '../types';
import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import { Loader } from '../loader';

export class HtmlLoader extends Loader {
  static readonly type = 'html' as const satisfies LoaderType;
  readonly type = HtmlLoader.type;

  load(ctx: LoadContext): Promise<ContentResult | null> {
    return Promise.resolve({ kind: 'html', html: ctx.ref });
  }
}

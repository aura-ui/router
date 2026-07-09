import { getTemplate } from '../../../../aura-utils/misc';
import type { ContentResult, LoadContext } from '../types';
import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import { Loader } from '../loader';

export class TemplateLoader extends Loader {
  static readonly type = 'template' as const satisfies LoaderType;
  readonly type = TemplateLoader.type;

  load(ctx: LoadContext): Promise<ContentResult | null> {
    return Promise.resolve({ kind: 'fragment', node: getTemplate(ctx.ref) });
  }
}

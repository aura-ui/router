import { getTemplate } from '../../../../../aura-utils/misc';
import type { LoaderType, LoadContext } from '../../model/types';
import type { ContentResult } from '../../model/result';
import { Loader } from '../loader';

export class TemplateLoader extends Loader {
  static readonly type = 'template' as const satisfies LoaderType;

  readonly type = TemplateLoader.type;

  load(ctx: LoadContext): Promise<ContentResult | null> {
    return Promise.resolve({ kind: 'fragment', node: getTemplate(ctx.ref) });
  }
}

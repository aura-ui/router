import type { LoaderType, LoadContext } from '../../model/types';
import type { ContentResult } from '../../model/result';
import { componentMarkup } from '../../model/context';
import { Loader } from '../loader';

export class ComponentLoader extends Loader {
  static readonly type = 'component' as const satisfies LoaderType;

  readonly type = ComponentLoader.type;

  load(ctx: LoadContext): Promise<ContentResult | null> {
    if (!customElements.get(ctx.ref)) {
      throw new Error(`Component '${ctx.ref}' is not registered`);
    }

    return Promise.resolve({ kind: 'markup', markup: componentMarkup(ctx.ref, ctx) });
  }
}

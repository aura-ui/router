import type { ContentResult, LoaderType, LoadContext } from '../../types';
import { componentMarkup } from '../markup';
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

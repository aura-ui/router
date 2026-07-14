import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { componentMarkup } from '../markup';
import { Loader } from '../loader';

/** `view="component::tag-name"` — registered custom element + `aura-data`. */
export class ComponentLoader extends Loader {
  static readonly type = 'component' as const satisfies LoaderId;
  static readonly needsData = true;

  load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    if (!customElements.get(ctx.content)) throw new Error(`Component '${ctx.content}' is not registered`);
    return Promise.resolve({ kind: 'markup', markup: componentMarkup(ctx.content, ctx) });
  }
}

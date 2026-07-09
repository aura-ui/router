import { loadAndRegisterComponent } from '../../../../aura-utils/misc';
import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import { componentMarkup } from '../markup';
import { Loader } from '../loader';

/** `view="import::./module.js"` — dynamic import, then component markup. */
export class ImportLoader extends Loader {
  static readonly type = 'import' as const satisfies LoaderType;
  readonly type = ImportLoader.type;

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    const tagName = await loadAndRegisterComponent(ctx.ref);
    return { kind: 'markup', markup: componentMarkup(tagName, ctx) };
  }
}

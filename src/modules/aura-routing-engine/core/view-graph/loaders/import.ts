import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { Singleflight } from '../../../../aura-utils/async/singleflight';
import { loadAndRegisterComponent } from '../../../../aura-utils/misc';
import { Loader } from '../loader';
import { componentMarkup } from '../markup';
import type { ViewLoadContext, ViewLoadResult } from '../types';

const importSingleflight = new Singleflight<string, string>();

async function resolveImportedTag(path: string): Promise<string> {
  // Shared in-flight import must not use a caller's signal — abort means "skip result"
  // for that caller, not cancel the load for concurrent waiters (prefetch vs navigation).
  return importSingleflight.do(path, () => loadAndRegisterComponent(path));
}

/** `view="import::./module.js"` — dynamic import, then component markup. */
export class ImportLoader extends Loader {
  static readonly type = 'import' as const satisfies LoaderId;
  static readonly needsData = true;

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    if (ctx.signal.aborted) return null;

    try {
      const tagName = await resolveImportedTag(ctx.content);
      if (ctx.signal.aborted) return null;
      return { kind: 'markup', value: componentMarkup(tagName, ctx) };
    } catch (error) {
      if (ctx.signal.aborted) return null;
      throw error;
    }
  }
}

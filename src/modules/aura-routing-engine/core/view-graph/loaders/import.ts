import { Singleflight } from '../../../../aura-utils/async/singleflight';
import { loadAndRegisterComponent } from '../../../../aura-utils/misc';
import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { componentMarkup } from '../markup';
import { Loader } from '../loader';

/** Resolved import path → custom element tag (process-wide, mirrors `customElements`). */
const resolvedImportPaths = new Map<string, string>();
const importSingleflight = new Singleflight<string, string>();

async function resolveImportedTag(path: string): Promise<string> {
  const cached = resolvedImportPaths.get(path);
  if (cached) return cached;

  // Shared in-flight import must not use a caller's signal — abort means "skip result"
  // for that caller, not cancel the load for concurrent waiters (prefetch vs navigation).
  return importSingleflight.do(path, async () => {
    const tagName = await loadAndRegisterComponent(path);
    resolvedImportPaths.set(path, tagName);
    return tagName;
  });
}

/** `view="import::./module.js"` — dynamic import, then component markup. */
export class ImportLoader extends Loader {
  static readonly type = 'import' as const satisfies LoaderId;

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    if (ctx.signal.aborted) return null;

    try {
      const tagName = await resolveImportedTag(ctx.content);
      if (ctx.signal.aborted) return null;
      return { kind: 'markup', markup: componentMarkup(tagName, ctx) };
    } catch (error) {
      if (ctx.signal.aborted) return null;
      throw error;
    }
  }
}

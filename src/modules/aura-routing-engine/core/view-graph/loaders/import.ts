import { loadAndRegisterComponent } from '../../../../aura-utils/misc';
import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { componentMarkup } from '../markup';
import { Loader } from '../loader';

/** Resolved import path → custom element tag (process-wide, mirrors `customElements`). */
const registeredImportPaths = new Map<string, string>();
/** In-flight dynamic imports keyed by module path. */
const inflightImports = new Map<string, Promise<string>>();

async function resolveImportedTag(path: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const cached = registeredImportPaths.get(path);
  if (cached) return cached;

  let inflight = inflightImports.get(path);
  if (!inflight) {
    inflight = loadAndRegisterComponent(path, signal)
      .then((tagName) => {
        registeredImportPaths.set(path, tagName);
        inflightImports.delete(path);
        return tagName;
      })
      .catch((error: unknown) => {
        inflightImports.delete(path);
        throw error;
      });
    inflightImports.set(path, inflight);
  }

  return inflight;
}

/** `view="import::./module.js"` — dynamic import, then component markup. */
export class ImportLoader extends Loader {
  static readonly type = 'import' as const satisfies LoaderId;

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    if (ctx.signal.aborted) return null;

    const tagName = await resolveImportedTag(ctx.content, ctx.signal);
    if (ctx.signal.aborted) return null;

    return { kind: 'markup', markup: componentMarkup(tagName, ctx) };
  }
}

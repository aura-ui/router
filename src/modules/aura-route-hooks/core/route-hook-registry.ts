import type {
  RouteHookDefinition,
  RouteHookContext,
  RouteLifecycleContext,
} from './types';
import { ROUTER_VERSION, satisfies } from './version';
import type { RedirectTarget } from '../../aura-routing-engine/core/types';

interface StoredHook {
  fn: RouteHookDefinition['fn'];
  version: string;
  options: Record<string, unknown>;
}

function isRedirectResult(
  result: boolean | void | RedirectTarget,
): result is string | { url: string; replace?: boolean } {
  return typeof result === 'string' || (typeof result === 'object' && result !== null && 'url' in result);
}

/** Cancel navigation (`false`) or redirect URL (`string`). */
function isTerminalResult(
  result: boolean | void | RedirectTarget,
): result is false | string | { url: string; replace?: boolean } {
  return result === false || isRedirectResult(result);
}

export class RouteHookRegistry {
  private static registry = new Map<string, StoredHook>();

  static register(hook: RouteHookDefinition, options: Record<string, unknown> = {}): void {
    const { name, version, fn, requires } = hook;
    const existing = this.registry.get(name);

    if (existing && existing.version !== version) {
      console.warn(`Hook "${name}" ${existing.version} → ${version}`);
    }

    if (requires && !satisfies(ROUTER_VERSION, requires)) {
      console.warn(`Hook "${name}@${version}" requires router ${requires}`);
    }

    this.registry.set(name, { fn, version, options });
  }

  static get(name: string): StoredHook | undefined {
    return this.registry.get(name);
  }

  /** Runs hooks in order; stops on first cancel (`false`) or redirect URL (`string`). */
  static async run(
    lifecycleCtx: RouteLifecycleContext,
    names: string[],
    isJobActive?: () => boolean,
  ): Promise<boolean | void | string> {
    const hookCtx: RouteHookContext = { ...lifecycleCtx, options: {} };

    for (const name of names) {
      if (!isJobActive?.()) return undefined;

      const entry = this.registry.get(name);

      if (!entry) {
        console.warn(`Unknown hook "${name}" on route ${lifecycleCtx.route.path} (phase ${lifecycleCtx.phase})`);
        continue;
      }

      hookCtx.options = entry.options;

      const result = await entry.fn(hookCtx);

      if (!isJobActive?.()) return undefined;

      if (isTerminalResult(result)) {
        return result;
      }
    }
  }
}

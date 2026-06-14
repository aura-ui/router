import type {
  RouteHookDefinition,
  RouteHookContext,
  RouteLifecycleContext,
} from './types';
import { ROUTER_VERSION, satisfies } from '../../aura-utils/misc';

interface StoredHook {
  fn: RouteHookDefinition['fn'];
  version: string;
  options: Record<string, unknown>;
}

/** Cancel navigation (`false`) or redirect URL (`string`). */
function isTerminalResult(result: boolean | void | string): result is false | string {
  return result === false || typeof result === 'string';
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
    names: string[],
    ctx: RouteLifecycleContext,
  ): Promise<boolean | void | string> {
    const hookCtx: RouteHookContext = { ...ctx, options: {} };
    const routePath = ctx.route.path;

    for (const name of names) {
      const entry = this.registry.get(name);

      if (!entry) {
        console.warn(`Unknown hook "${name}" on route ${routePath} (phase ${ctx.phase})`);
        continue;
      }

      hookCtx.options = entry.options;

      const result = await entry.fn(hookCtx);
      if (isTerminalResult(result)) {
        return result;
      }
    }
  }
}

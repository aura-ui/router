import type { GuardResult, RedirectTarget } from '../guard.types';
import type {
  HookResultInput,
  RouteHookContext,
  RouteHookDefinition,
  RouteLifecycleContext,
} from './types';
import { ROUTER_VERSION, satisfies } from './version';

function isRedirectTarget(value: HookResultInput): value is string | RedirectTarget {
  return typeof value === 'string'
    || (typeof value === 'object' && value !== null && 'url' in value && !('type' in value));
}

/** Maps hook return values to {@link GuardResult} for the processor pipeline. */
export function normalizeHookResult(result: HookResultInput | undefined): GuardResult {
  if (result === undefined || result === true) return undefined;
  if (result === false) return false;
  if (typeof result === 'string') return result;
  if (isRedirectTarget(result)) return result;

  if (typeof result === 'object' && result !== null && 'type' in result) {
    const typed = result as { type: string; url?: string; replace?: boolean };
    if (typed.type === 'redirect' && typed.url) {
      return {
        url: typed.url,
        ...(typed.replace !== undefined && { replace: typed.replace }),
      };
    }
    if (typed.type === 'continue') return undefined;
    if (typed.type === 'cancel') return false;
  }

  return undefined;
}

function isTerminalGuardResult(result: GuardResult): result is false | RedirectTarget {
  return result === false || isRedirectTarget(result);
}

interface StoredHook {
  fn: (ctx: RouteHookContext) => Promise<unknown>;
  version: string;
  options: Record<string, unknown>;
}

export class HookRegistry {
  private readonly entries = new Map<string, StoredHook>();

  register<TOptions extends Record<string, unknown> = Record<string, unknown>>(
    hook: RouteHookDefinition<TOptions>,
    options: TOptions = {} as TOptions,
  ): void {
    const { name, version, fn, requires } = hook;
    const existing = this.entries.get(name);

    if (existing && existing.version !== version) {
      console.warn(`Hook "${name}" ${existing.version} → ${version}`);
    }

    if (requires && !satisfies(ROUTER_VERSION, requires)) {
      console.warn(`Hook "${name}@${version}" requires router ${requires}`);
    }

    this.entries.set(name, {
      fn: fn as StoredHook['fn'],
      version,
      options: options as Record<string, unknown>,
    });
  }

  get(name: string): StoredHook | undefined {
    return this.entries.get(name);
  }

  async run(
    lifecycleCtx: RouteLifecycleContext,
    names: readonly string[],
    isJobActive?: () => boolean,
  ): Promise<GuardResult | undefined> {
    const hookCtx: RouteHookContext = { ...lifecycleCtx, options: {} };

    for (const name of names) {
      if (!isJobActive?.()) return undefined;

      const entry = this.entries.get(name);
      if (!entry) {
        console.warn(
          `Unknown hook "${name}" on route ${lifecycleCtx.route.path} (phase ${lifecycleCtx.phase})`,
        );
        continue;
      }

      hookCtx.options = entry.options;
      const raw = await entry.fn(hookCtx);
      if (!isJobActive?.()) return undefined;

      const result = normalizeHookResult(raw as HookResultInput);
      if (isTerminalGuardResult(result)) return result;
    }

    return undefined;
  }
}

export const defaultHookRegistry = new HookRegistry();

/** @deprecated Use {@link defaultHookRegistry}. */
export const RouteHookRegistry = {
  register: (...args: Parameters<HookRegistry['register']>) => defaultHookRegistry.register(...args),
  get: (...args: Parameters<HookRegistry['get']>) => defaultHookRegistry.get(...args),
  run: (...args: Parameters<HookRegistry['run']>) => defaultHookRegistry.run(...args),
};

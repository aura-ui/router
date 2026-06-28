/**
 * Hook registry and runtime — register global hooks, run them during navigation.
 *
 * Flow: route attrs → {@link ../lifecycle/phase-attrs!resolveHookNames} → {@link runPhaseHooks} → {@link HookRegistry.run}.
 * Blocking phases stop on first cancel/redirect. Post-commit phases ignore cancel/redirect (warn).
 *
 * @module hooks/registry
 */

import type { GuardResult, RedirectTarget } from '../guard.types';
import type { RouteLifecycleContext } from '../route/types';

import type {
  HookResultInput,
  RouteHookContext,
  RouteHookDefinition,
} from './types';
import { ROUTER_VERSION, satisfies } from './version';

function isRedirectTarget(value: HookResultInput): value is RedirectTarget {
  return typeof value === 'string'
    || (typeof value === 'object' && value !== null && 'url' in value && !('type' in value));
}

/**
 * Normalizes hook return values to {@link GuardResult} for the processor pipeline.
 *
 * @example
 * ```ts
 * normalizeHookResult(false);                    // false (cancel)
 * normalizeHookResult('/login');                 // '/login'
 * normalizeHookResult({ type: 'redirect', url: '/login', replace: true });
 * // → { url: '/login', replace: true }
 * ```
 */
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

/**
 * In-memory catalog of registered route hooks.
 *
 * Use {@link defaultHookRegistry} via `AuraRouter.use()` / `AuraRouter.unuse()` in apps.
 * That registry is process-wide: every default `AuraRouter` instance shares the
 * same hook catalog. Inject a custom instance into
 * {@link ../processor/processor!AuraRoutingProcessor} for isolated tests.
 */
export class HookRegistry {
  private readonly entries = new Map<string, StoredHook>();

  /**
   * Registers a hook by name.
   *
   * Re-registering the same `fn` + `version` updates options only (no version warn, no re-check of `requires`).
   * Options are stored as a shallow snapshot.
   *
   * @throws When `hook.requires` is not satisfied by {@link ROUTER_VERSION} (new or upgraded registration)
   */
  register<TOptions extends Record<string, unknown> = Record<string, unknown>>(
    hook: RouteHookDefinition<TOptions>,
    options: TOptions = {} as TOptions,
  ): void {
    const { name, version, fn, requires } = hook;
    const existing = this.entries.get(name);

    const stored: StoredHook = {
      fn: fn as StoredHook['fn'],
      version,
      options: { ...options },
    };

    if (existing?.fn === fn && existing.version === version) {
      this.entries.set(name, stored);
      return;
    }

    if (existing && existing.version !== version) {
      console.warn(`Hook "${name}" ${existing.version} → ${version}`);
    }

    if (requires && !satisfies(ROUTER_VERSION, requires)) {
      throw new Error(
        `Hook "${name}@${version}" requires router ${requires} (current: ${ROUTER_VERSION})`,
      );
    }

    this.entries.set(name, stored);
  }

  /** Removes a hook by name. Returns `true` when an entry existed. */
  unregister(name: string): boolean {
    return this.entries.delete(name);
  }

  /** Returns whether a hook name is registered. */
  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Returns the stored entry (internal/testing). */
  get(name: string): StoredHook | undefined {
    return this.entries.get(name);
  }

  /**
   * Runs hooks sequentially for one route/phase.
   *
   * Stops on first cancel (`false`) or redirect. Unknown names are skipped with a warning.
   * Each hook gets a fresh {@link RouteHookContext} (no shared mutable ctx between hooks).
   *
   * @param isJobActive - when it returns `false`, remaining hooks are skipped
   */
  async run(
    lifecycleCtx: RouteLifecycleContext,
    names: readonly string[],
    isJobActive?: () => boolean,
  ): Promise<GuardResult | undefined> {
    for (const name of names) {
      if (!isJobActive?.()) return undefined;

      const entry = this.entries.get(name);
      if (!entry) {
        console.warn(
          `Unknown hook "${name}" on route ${lifecycleCtx.route.path} (phase ${lifecycleCtx.phase})`,
        );
        continue;
      }

      const hookCtx: RouteHookContext = { ...lifecycleCtx, options: entry.options };
      const raw = await entry.fn(hookCtx);
      if (!isJobActive?.()) return undefined;

      const result = normalizeHookResult(raw as HookResultInput);
      if (isTerminalGuardResult(result)) return result;
    }

    return undefined;
  }
}

/**
 * Processor-facing wrapper: runs phase hooks and maps superseded jobs to `false`.
 *
 * @example
 * ```ts
 * await runPhaseHooks(registry, ctx, ['auth', 'audit'], () => !job.aborted);
 * ```
 */
export async function runPhaseHooks(
  registry: HookRegistry,
  lifecycleContext: RouteLifecycleContext,
  hookNames: readonly string[],
  isJobActive: () => boolean,
): Promise<GuardResult> {
  if (!hookNames.length) return undefined;

  try {
    const result = await registry.run(lifecycleContext, hookNames, isJobActive);
    if (!isJobActive()) return false;
    return result;
  } catch (error) {
    if (!isJobActive()) return false;
    throw error;
  }
}

/**
 * Global hook catalog — wired by `AuraRouter.use()` and `AuraRouter.unuse()`.
 *
 * This singleton is the default public model: hooks are shared by all router
 * instances unless a caller explicitly constructs `AuraRoutingProcessor` with a
 * custom {@link HookRegistry}.
 */
export const defaultHookRegistry = new HookRegistry();

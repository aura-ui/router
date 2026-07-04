import type { HistoryAction } from '../history/provider.types';
import type { PreserveFlags } from '../content/model/preserve';
import type { RouterPrefetchPolicy } from '../prefetch/prefetch-policy';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import type { RouteHookAttrProp, RoutePhase } from '../lifecycle/types';

export type { RouterPrefetchPolicy };

/** Target route slice passed to lifecycle callbacks and hooks. */
export interface RouteInfo {
  pathname: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/** Minimal router surface exposed to hooks (`ctx.router`). */
export interface RouterInstance {
  navigate(path: string, options?: { replace?: boolean; syncHistory?: boolean }): void;
}

/**
 * Route hook name sources — phase attrs on `<aura-route>`.
 *
 * @example
 * ```html
 * <aura-route path="/admin" enter="auth" after="analytics"></aura-route>
 * ```
 */
export type RouteHookNamesSource = Record<RouteHookAttrProp, string[] | null>;

/**
 * Context for route lifecycle callbacks and registered hooks.
 *
 * `transactionSignal` aborts when the navigation transaction is superseded —
 * long async hooks should check it.
 */
export interface RouteLifecycleContext {
  phase: RoutePhase;
  to: RouteInfo;
  from: RouteInfo | null;
  router: RouterInstance;
  route: RouteInstance;
  action: HistoryAction;
  transactionId: number;
  transactionSignal: AbortSignal;
  /** Load-hook payload from DataGraph when available for this route/phase. */
  data?: unknown;
  error?: unknown;
}

/** {@link RouteLifecycleContext} for the terminal `error` phase (`error` is required). */
export type RouteErrorContext = RouteLifecycleContext & {
  error: unknown;
};

/** Route surface used by the routing engine and hook runtime. */
export interface RouteInstance extends RouteHookNamesSource {
  path: string;
  /** From `<aura-route preserve="…">` — view DOM and/or load-hook payload retention. */
  preserve?: PreserveFlags;
  /** Inherited from `<aura-route prefetch>` / `<aura-router prefetch>`. */
  readonly prefetch?: RouterPrefetchPolicy | null;
  readonly transition: RouteTransitionType;
  readonly hasEnter: boolean;
  readonly hasReenter: boolean;
  readonly hasLeave: boolean;
  readonly hasLoad: boolean;
  readonly hasTransitionIn: boolean;
  readonly hasPostEffects: boolean;
  readonly hasAsyncContent: boolean;
  readonly hasSyncContent: boolean;
  onEnter(ctx: RouteLifecycleContext): void;
  onTransitionIn(ctx: RouteLifecycleContext): void;
  onLoad(ctx: RouteLifecycleContext): void;
  onAfter(ctx: RouteLifecycleContext): void;
  onLeave(ctx: RouteLifecycleContext): void;
  onTransitionOut(ctx: RouteLifecycleContext): void;
  onLeft(ctx: RouteLifecycleContext): void;
  onReenter(ctx: RouteLifecycleContext): void;
  onError(ctx: RouteErrorContext): void;
  commitStagedView?(): void;
  /** Drops staged views and clears in-flight transition presentation (cancel / supersede). */
  revertInFlightView?(): void;
}

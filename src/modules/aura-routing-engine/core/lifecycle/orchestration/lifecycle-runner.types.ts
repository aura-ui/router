import type { ReportNavigationHookError } from '../../failure/navigation-failure';
import type { HistoryAction } from '../../history/provider.types';
import type { HookRegistry } from '../../hooks/registry';
import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { RouterInstance } from '../../route/types';
import type { TransitionMap } from '../../route-tree/transition-plan';
import type { CommitTracker } from '../../view-mount/view-mount-tracker';
import type { LifecycleJobSlice } from '../context/lifecycle-context';

export interface LifecycleTransactionContext {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  plan: TransitionMap;
}

/** Processor-facing context required to execute lifecycle phases. */
export interface LifecycleRuntimeContext {
  transaction: LifecycleTransactionContext;
  job: LifecycleJobSlice;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  commitTracker: CommitTracker;
  reportHookError?: ReportNavigationHookError;
  isJobActive: () => boolean;
}

/**
 * Minimal processor context accepted by {@link ../lifecycle-runtime-adapter!toLifecycleRuntimeContext}.
 * `transaction` may carry processor-only fields (e.g. `transitionOrder`).
 */
export interface LifecyclePipelineBridge {
  transaction: LifecycleTransactionContext & Record<string, unknown>;
  job: LifecycleJobSlice;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  commitTracker: CommitTracker;
  reportHookError?: ReportNavigationHookError;
  isJobActive: () => boolean;
}

import type { DataSnapshot } from '../../data-graph';
import type { ReportNavigationHookError } from '../../failure';
import type { HistoryAction } from '../../history/provider.types';
import type { HookRegistry } from '../../hooks/registry';
import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { RouterInstance } from '../../route/types';
import type { TransitionMap } from '../../route-tree/transition-plan';
import type { ViewCommitTracker } from '../../view-mount/view-commit-tracker';
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
  navigationJob: LifecycleJobSlice;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  viewCommitTracker: ViewCommitTracker;
  reportHookError?: ReportNavigationHookError;
  isJobActive: () => boolean;
  /** Load-hook payloads from DataGraph after the load phase. */
  dataSnapshot?: DataSnapshot;
}

/**
 * Minimal processor context accepted by {@link ../lifecycle-runtime-adapter!createLifecycleRuntimeContext}.
 * Implementations may carry processor-only fields; lifecycle only reads this slice.
 */
export interface LifecyclePipelineBridge {
  transaction: LifecycleTransactionContext;
  navigationJob: LifecycleJobSlice;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  viewCommitTracker: ViewCommitTracker;
  reportHookError?: ReportNavigationHookError;
  isJobActive: () => boolean;
  /** Load-hook payloads from DataGraph after the load phase. */
  dataSnapshot?: DataSnapshot;
}

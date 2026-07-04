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

/** Runtime context required for load hooks and error-phase handling. */
export interface LifecycleRuntimeContext {
  transaction: LifecycleTransactionContext;
  navigationJob: LifecycleJobSlice;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  viewCommitTracker: ViewCommitTracker;
  reportHookError?: ReportNavigationHookError;
  isJobActive: () => boolean;
  dataSnapshot?: DataSnapshot;
}

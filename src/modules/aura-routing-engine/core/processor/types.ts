import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { ReportNavigationHookError } from '../failure/navigation-failure';
import type { RouterInstance } from '../route/types';

/** Synchronous hook invoked at the commit gate after DOM promotion (history + `prev`). */
export type CommitGateFn = () => void;

/** Arguments for {@link AuraRoutingProcessor.run} (plan and policy are added by the processor). */
export interface ProcessorRunInput {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  router: RouterInstance;
  reportHookError?: ReportNavigationHookError;
  /** Engine-owned history commit; runs when the job wins {@link ProcessorPipeline.runAfterRender}. */
  commitGate?: CommitGateFn;
}

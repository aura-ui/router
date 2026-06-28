import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { ReportNavigationHookError } from '../failure/navigation-failure';
import type { RouterInstance } from '../hooks/types';

/** Arguments for {@link AuraRoutingProcessor.run} (plan and policy are added by the processor). */
export interface ProcessorRunInput {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  router: RouterInstance;
  reportHookError?: ReportNavigationHookError;
}

/**
 * Callback-only `unmount` of the previous leaf before pre-match fallback 404.
 *
 * @module navigation/unmount-prev-on-not-found
 */

import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouterInstance } from '../route/types';
import { getLeafMatch } from '../route-tree/matched-chain';

import { PHASES } from './lifecycle-phases';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';

export interface UnmountPrevOnNotFoundInput {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
}

/**
 * Runs legacy `unmount` for the previous leaf when there is no match / no
 * transition plan. Shares lifecycle context construction with the pipeline.
 */
export function unmountPrevOnNotFound(input: UnmountPrevOnNotFoundInput): void {
  if (!input.from) return;

  const leaf = getLeafMatch(input.from);
  PHASES.unmount.runRouteLifecycle(
    leaf.route,
    NavigationTransactionPipelinePhase.buildPhaseContext(PHASES.unmount.phase, leaf, {
      from: null,
      action: input.action,
      router: input.router,
      transactionId: 0,
      transactionSignal: new AbortController().signal,
    }),
  );
}

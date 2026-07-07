/**
 * Pre-match NOT_FOUND exit cleanup — unmount callback for the previous leaf route.
 *
 * @module failure/not-found-exit-cleanup
 */

import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { NavigationTransactionPipelinePhase } from '../navigation/navigation-transaction-pipeline-phase';
import { PHASES } from '../navigation/navigation-transaction-pipeline-phases-names';
import type { RouterInstance } from '../route/types';
import { getLeafMatch } from '../route-tree/matched-chain';

export interface NotFoundExitInput {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
}

/**
 * Runs legacy `unmount` cleanup for the previous leaf route before fallback 404.
 *
 * Pre-match NOT_FOUND has no processor job or transition plan, so this function
 * deliberately keeps the old callback-only semantics while sharing lifecycle
 * context construction with the normal pipeline.
 */
export function runNotFoundExitCleanup(input: NotFoundExitInput): void {
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

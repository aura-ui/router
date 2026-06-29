import type { HistoryAction } from '../../history/provider.types';
import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { RouterInstance } from '../../route/types';
import { getLeafMatch } from '../../route-tree/matched-chain';
import { createLifecycleContext } from '../context/lifecycle-context';
import { PHASES } from '../phase-registry';

export interface NotFoundExitInput {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
}

/**
 * Runs legacy `left` cleanup for the previous leaf route before fallback 404.
 *
 * Pre-match NOT_FOUND has no processor job or transition plan, so this function
 * deliberately keeps the old callback-only semantics while sharing lifecycle
 * context construction with the normal pipeline.
 */
export function runNotFoundExitCleanup(input: NotFoundExitInput): void {
  if (!input.from) return;

  const leaf = getLeafMatch(input.from);
  PHASES.left.runRouteLifecycle(
    leaf.route,
    createLifecycleContext(PHASES.left.phase, leaf, {
      from: null,
      action: input.action,
      router: input.router,
      navigationJob: {
        id: 0,
        signal: new AbortController().signal,
      },
    }),
  );
}

import type { HistoryAction } from '../history/provider.types';
import type { RouterInstance } from '../hooks/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { getLeafMatch } from '../route-tree/matched-chain';

/** Runs `onLeft` on the previous route before fallback 404 (legacy bypass semantics). */
export function runNotFoundExitCleanup(
  from: MatchedRouteInfo | null,
  action: HistoryAction,
  router: RouterInstance,
): void {
  if (!from) return;

  const leaf = getLeafMatch(from);
  leaf.route.onLeft({
    phase: 'left',
    from: null,
    to: {
      pathname: leaf.pathname,
      ...(leaf.params && { params: leaf.params }),
      ...(leaf.query && { query: leaf.query }),
    },
    router,
    route: leaf.route,
    action,
    jobId: 0,
    signal: new AbortController().signal,
  });
}

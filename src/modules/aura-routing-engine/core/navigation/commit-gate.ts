import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { HistoryProviderLike } from '../history/history-policy';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { isSameNavigationTarget } from '../route-tree/transition-plan';
import { applyTransactionHistory } from './finalize';

/** Context for the single commit point after a navigation job wins (DOM already promoted). */
export interface CommitGateContext {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  href: string;
  hash: string;
  options: NavigateHistoryOptions;
  provider: HistoryProviderLike;
  onNavigationCommitted?: (to: MatchedRouteInfo) => void;
  scrollToHash?: (hash: string) => void;
}

export interface CommitGateEffects {
  setPrev: MatchedRouteInfo;
}

/**
 * Commits browser history and engine `prev` after view promotion at the commit gate.
 * Called synchronously from the processor when {@link isJobActive} is still true.
 */
export function applyCommitGate(ctx: CommitGateContext): CommitGateEffects {
  const fromHref = ctx.from?.href ?? null;
  const sameTarget = !!ctx.from && isSameNavigationTarget(ctx.from, ctx.to);

  applyTransactionHistory(
    { status: 'navigationSucceeded' },
    ctx.action,
    ctx.href,
    fromHref,
    ctx.options,
    ctx.provider,
    { sameTarget },
  );

  ctx.onNavigationCommitted?.(ctx.to);
  if (ctx.hash) ctx.scrollToHash?.(ctx.hash);

  return { setPrev: ctx.to };
}

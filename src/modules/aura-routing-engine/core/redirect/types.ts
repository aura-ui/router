import type { MatchedRouteInfo } from '../match/url-matcher';

/** Leaf match at one redirect-resolution step (internal match-step union tag). */
export type MatchedNavigationTarget = MatchedRouteInfo & {
  readonly kind: 'matched';
  readonly viaRedirect: boolean;
};

/** Redirect chain failure (cycle or depth). */
export type RedirectErrorOutcome = {
  readonly status: 'redirect-error';
  readonly code: 'redirect-cycle' | 'redirect-depth-exceeded';
  readonly href: string;
};

/** Result of sync declarative redirect resolution (prefetch, diagnostics). */
export type DeclarativeRedirectOutcome =
  | { readonly status: 'resolved'; readonly target: MatchedNavigationTarget }
  | { readonly status: 'unmatched' }
  | RedirectErrorOutcome;

/** One redirection step: leaf match or declarative redirect. */
export type NavigationMatchStep =
  | MatchedNavigationTarget
  | { readonly kind: 'redirect'; readonly href: string };

import type { MatchedRouteInfo } from '../match/url-matcher';

/** Leaf match at one redirect-resolution step (internal match-step union tag). */
export type MatchedNavigationTarget = MatchedRouteInfo & {
  readonly kind: 'matched';
  readonly viaRedirect: boolean;
};

/** Terminal redirect step failure (cycle or depth). */
export type RedirectStepError = {
  readonly kind: 'redirect-error';
  readonly code: 'redirect-cycle' | 'redirect-depth-exceeded';
  readonly href: string;
};

/** Result of sync declarative redirect resolution (prefetch, diagnostics). */
export type DeclarativeTargetResolve =
  | MatchedNavigationTarget
  | { readonly kind: 'unmatched' }
  | RedirectStepError;

/** One redirection step: leaf match or declarative redirect. */
export type NavigationMatchStep =
  | MatchedNavigationTarget
  | { readonly kind: 'redirect'; readonly href: string };

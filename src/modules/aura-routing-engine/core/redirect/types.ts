import type { MatchedRouteInfo } from '../match/url-matcher';

/** Successful match after following declarative redirect hops. */
export type MatchedNavigationTarget = {
  readonly kind: 'matched';
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly leaf: MatchedRouteInfo;
  readonly chain: readonly MatchedRouteInfo[];
  /** True when any hop in the chain was a declarative redirect (history should replace). */
  readonly viaRedirect: boolean;
};

/** Terminal redirect hop failure (cycle or depth). */
export type RedirectHopError = {
  readonly kind: 'redirect-error';
  readonly code: 'redirect-cycle' | 'redirect-depth-exceeded';
  readonly href: string;
};

/** Result of sync declarative redirect resolution (prefetch, diagnostics). */
export type DeclarativeTargetResolve =
  | MatchedNavigationTarget
  | { readonly kind: 'unmatched' }
  | RedirectHopError;

/** One match hop: leaf page/folder index or declarative redirect. */
export type NavigationMatchStep =
  | MatchedNavigationTarget
  | { readonly kind: 'redirect'; readonly href: string };

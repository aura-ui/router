export { resolveRedirectHref, matchNavigationStep } from './match-hop';
export { MAX_REDIRECT_HOPS, advanceRedirectHop, navigationVisitKey } from './hop-loop';
export { resolveDeclarativeTarget, resolveRedirectChain } from './redirect-resolver';
export type {
  DeclarativeTargetResolve,
  MatchedNavigationTarget,
  NavigationMatchStep,
  RedirectHopError,
} from './types';
export type { RedirectChainContext, RedirectResolveResult } from './redirect-resolver';

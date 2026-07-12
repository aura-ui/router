export { resolveRedirectHref, lookupNavigationStep } from './match-step';
export {
  MAX_REDIRECTION_STEPS,
  createRedirectionContext,
  navigationVisitKey,
  followDeclarativeRedirects,
  followRedirectsWithBlockingPhases,
} from './redirect-resolver';
export type {
  DeclarativeRedirectOutcome,
  MatchedNavigationTarget,
  NavigationMatchStep,
  RedirectErrorOutcome,
  RedirectMatcher,
  RedirectResolveResult,
  RedirectResolverContext,
  RedirectionContext,
} from './types';

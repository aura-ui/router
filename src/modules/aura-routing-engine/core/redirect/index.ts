export { resolveRedirectHref, lookupNavigationStep } from './match-step';
export {
  MAX_REDIRECTION_STEPS,
  createRedirectionContext,
  navigationVisitKey,
  followDeclarativeRedirects,
  followRedirectsWithBlockingPhases,
} from './redirect-resolver';
export type { RedirectionContext, RedirectResolverContext, RedirectResolveResult } from './redirect-resolver';
export type {
  DeclarativeTargetResolve,
  MatchedNavigationTarget,
  NavigationMatchStep,
  RedirectStepError,
} from './types';

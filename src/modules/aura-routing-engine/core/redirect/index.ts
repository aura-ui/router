/**
 * Pre-commit redirect resolution: declarative `redirect` attrs and guard-walk hook redirects.
 *
 * @see `README.md` for pipeline diagram and outcome types.
 */
export { resolveRedirectHref, lookupNavigationStep } from './match-step';
export {
  MAX_REDIRECTION_STEPS,
  createRedirectionContext,
  navigationVisitKey,
  followDeclarativeRedirects,
  followRedirectsWithGuardWalk,
} from './redirect-resolver';
export type {
  DeclarativeRedirectOutcome,
  MatchedNavigationTarget,
  NavigationMatchStep,
  RedirectErrorOutcome,
  RedirectMatcher,
  RedirectResolveResult,
  RedirectResolverContext,
  RedirectUnmatchedOutcome,
  RedirectionContext,
} from './types';

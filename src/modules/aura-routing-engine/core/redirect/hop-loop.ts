import { resolveDocumentHrefParts, stripTrailingSlash } from '../../../aura-utils/misc/url';
import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingUrlMatcher } from '../match/url-matcher';
import type { RouteNode } from '../route-tree/route-node.types';
import { matchNavigationStep } from './match-hop';
import type {
  DeclarativeTargetResolve,
  MatchedNavigationTarget,
  RedirectHopError,
} from './types';

export const MAX_REDIRECT_HOPS = 5;

/** Terminal hop-loop outcomes other than a successful leaf match. */
export type RedirectHopTerminal = Exclude<DeclarativeTargetResolve, MatchedNavigationTarget>;

/** Continue the hop loop with another redirect target (declarative or hook). */
export type RedirectHopContinue = { readonly kind: 'redirect'; readonly href: string };

/** Mutable state shared by sync and async redirect hop loops. */
export type HopContext = {
  readonly initial: ResolvedDocumentHref;
  currentHref: string;
  readonly visited: Set<string>;
  viaRedirect: boolean;
  replace: boolean;
};

/** Normalized pathname key for redirect cycle detection (`/a` and `/a/` → same key). */
export function navigationVisitKey(href: string): string {
  return stripTrailingSlash(resolveDocumentHrefParts(href).pathname);
}

/** Validates depth/cycle guards and records one redirect visit (does not mutate hop state). */
export function validateRedirectHop(
  visited: Set<string>,
  nextHref: string,
  hop: number,
  currentHref: string,
): { href: string } | RedirectHopError {
  if (hop >= MAX_REDIRECT_HOPS) {
    return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: currentHref };
  }
  const nextKey = navigationVisitKey(nextHref);
  if (visited.has(nextKey)) {
    return { kind: 'redirect-error', code: 'redirect-cycle', href: nextHref };
  }
  visited.add(nextKey);
  return { href: nextHref };
}

export function createHopContext(
  href: string | ResolvedDocumentHref,
  replace = false,
): HopContext {
  const initial = typeof href === 'string' ? resolveDocumentHrefParts(href) : href;
  return {
    initial,
    currentHref: initial.href,
    visited: new Set([navigationVisitKey(initial.href)]),
    viaRedirect: false,
    replace,
  };
}

export function withViaRedirect(
  hopState: HopContext,
  step: MatchedNavigationTarget,
): MatchedNavigationTarget {
  return hopState.viaRedirect || step.viaRedirect ? { ...step, viaRedirect: true } : step;
}

export function shouldReplaceHistory(
  hopState: HopContext,
  target: MatchedNavigationTarget,
): boolean {
  return hopState.replace || target.viaRedirect;
}

function redirectDepthExceeded(hopState: HopContext): RedirectHopError {
  return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: hopState.currentHref };
}

function isRedirectContinue(value: unknown): value is RedirectHopContinue {
  return typeof value === 'object'
    && value !== null
    && 'kind' in value
    && (value as RedirectHopContinue).kind === 'redirect';
}

function matchAtCurrentHref(
  hopState: HopContext,
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  nodes: readonly RouteNode[],
): ReturnType<typeof matchNavigationStep> {
  return matchNavigationStep(
    matcher,
    hopState.currentHref,
    nodes,
    hopState.initial.search,
    hopState.initial.hash,
  );
}

function applyRedirectHop(
  hopState: HopContext,
  nextHref: string,
  hop: number,
): 'continue' | RedirectHopError {
  const next = validateRedirectHop(hopState.visited, nextHref, hop, hopState.currentHref);
  if ('kind' in next) return next;
  hopState.currentHref = next.href;
  hopState.viaRedirect = true;
  return 'continue';
}

function runSyncRedirectHopLoop<T>(
  hopState: HopContext,
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => T | RedirectHopContinue,
): T | DeclarativeTargetResolve {
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const matchStep = matchAtCurrentHref(hopState, matcher, nodes);
    if (!matchStep) return { kind: 'unmatched' };

    if (matchStep.kind === 'redirect') {
      const redirectResult = applyRedirectHop(hopState, matchStep.href, hop);
      if (redirectResult !== 'continue') return redirectResult;
      continue;
    }

    const outcome = onMatched(withViaRedirect(hopState, matchStep));
    if (isRedirectContinue(outcome)) {
      const redirectResult = applyRedirectHop(hopState, outcome.href, hop);
      if (redirectResult !== 'continue') return redirectResult;
      continue;
    }

    return outcome;
  }

  return redirectDepthExceeded(hopState);
}

/**
 * Sync redirect hop loop — declarative attr hops only.
 * @see resolveDeclarativeTarget
 */
export function followDeclarativeRedirectHops<T>(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => T,
): T | DeclarativeTargetResolve {
  return runSyncRedirectHopLoop(createHopContext(href), matcher, nodes, onMatched);
}

/**
 * Async redirect hop loop — declarative hops plus hook redirects from `onMatched`.
 * @see resolveRedirectChain
 */
export async function followRedirectHopsWithHooks<T>(
  hopState: HopContext,
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => Promise<T | RedirectHopContinue>,
): Promise<T | RedirectHopTerminal> {
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const matchStep = matchAtCurrentHref(hopState, matcher, nodes);
    if (!matchStep) return { kind: 'unmatched' };

    if (matchStep.kind === 'redirect') {
      const redirectResult = applyRedirectHop(hopState, matchStep.href, hop);
      if (redirectResult !== 'continue') return redirectResult;
      continue;
    }

    const outcome = await onMatched(withViaRedirect(hopState, matchStep));
    if (isRedirectContinue(outcome)) {
      const redirectResult = applyRedirectHop(hopState, outcome.href, hop);
      if (redirectResult !== 'continue') return redirectResult;
      continue;
    }

    return outcome;
  }

  return redirectDepthExceeded(hopState);
}

export function isHopLoopTerminal(outcome: unknown): outcome is RedirectHopTerminal {
  return typeof outcome === 'object'
    && outcome !== null
    && 'kind' in outcome
    && ((outcome as DeclarativeTargetResolve).kind === 'unmatched'
      || (outcome as DeclarativeTargetResolve).kind === 'redirect-error');
}

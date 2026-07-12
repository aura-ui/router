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

type RedirectHopState = {
  readonly initial: ResolvedDocumentHref;
  currentHref: string;
  viaRedirect: boolean;
  readonly visited: Set<string>;
};

/** Normalized pathname key for redirect cycle detection (`/a` and `/a/` → same key). */
export function navigationVisitKey(href: string): string {
  return stripTrailingSlash(resolveDocumentHrefParts(href).pathname);
}

/** Validates and records one redirect hop (declarative or hook). */
export function advanceRedirectHop(
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

function createRedirectHopState(href: string | ResolvedDocumentHref): RedirectHopState {
  const initial = typeof href === 'string' ? resolveDocumentHrefParts(href) : href;
  return {
    initial,
    currentHref: initial.href,
    viaRedirect: false,
    visited: new Set([navigationVisitKey(initial.href)]),
  };
}

function finalizeMatchedTarget(
  step: MatchedNavigationTarget,
  viaRedirect: boolean,
): MatchedNavigationTarget {
  return viaRedirect || step.viaRedirect ? { ...step, viaRedirect: true } : step;
}

function isRedirectContinue(value: unknown): value is RedirectHopContinue {
  return typeof value === 'object'
    && value !== null
    && 'kind' in value
    && (value as RedirectHopContinue).kind === 'redirect';
}

function advanceHopState(
  state: RedirectHopState,
  nextHref: string,
  hop: number,
): 'continue' | RedirectHopError {
  const next = advanceRedirectHop(state.visited, nextHref, hop, state.currentHref);
  if ('kind' in next) return next;
  state.currentHref = next.href;
  state.viaRedirect = true;
  return 'continue';
}

function runRedirectHopLoop<T>(
  state: RedirectHopState,
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => T | RedirectHopContinue,
): T | DeclarativeTargetResolve {
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const step = matchNavigationStep(
      matcher,
      state.currentHref,
      nodes,
      state.initial.search,
      state.initial.hash,
    );
    if (!step) return { kind: 'unmatched' };

    if (step.kind === 'redirect') {
      const advanced = advanceHopState(state, step.href, hop);
      if (advanced !== 'continue') return advanced;
      continue;
    }

    const outcome = onMatched(finalizeMatchedTarget(step, state.viaRedirect));
    if (isRedirectContinue(outcome)) {
      const advanced = advanceHopState(state, outcome.href, hop);
      if (advanced !== 'continue') return advanced;
      continue;
    }

    return outcome;
  }

  return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: state.currentHref };
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
  return runRedirectHopLoop(createRedirectHopState(href), matcher, nodes, onMatched);
}

/**
 * Async redirect hop loop — declarative hops plus hook redirects from `onMatched`.
 * @see resolveRedirectChain
 */
export async function followNavigationRedirectHops<T>(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => Promise<T | RedirectHopContinue>,
): Promise<T | RedirectHopTerminal> {
  const state = createRedirectHopState(href);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const step = matchNavigationStep(
      matcher,
      state.currentHref,
      nodes,
      state.initial.search,
      state.initial.hash,
    );
    if (!step) return { kind: 'unmatched' };

    if (step.kind === 'redirect') {
      const advanced = advanceHopState(state, step.href, hop);
      if (advanced !== 'continue') return advanced;
      continue;
    }

    const outcome = await onMatched(finalizeMatchedTarget(step, state.viaRedirect));
    if (isRedirectContinue(outcome)) {
      const advanced = advanceHopState(state, outcome.href, hop);
      if (advanced !== 'continue') return advanced;
      continue;
    }

    return outcome;
  }

  return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: state.currentHref };
}

export function isDeclarativeTerminal(outcome: unknown): outcome is RedirectHopTerminal {
  return typeof outcome === 'object'
    && outcome !== null
    && 'kind' in outcome
    && ((outcome as DeclarativeTargetResolve).kind === 'unmatched'
      || (outcome as DeclarativeTargetResolve).kind === 'redirect-error');
}

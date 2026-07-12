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

type HopIterationResult<T> =
  | { readonly action: 'retry' }
  | { readonly action: 'return'; readonly value: T | RedirectHopTerminal };

type Matcher = Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;

function matchAt(hopState: HopContext, matcher: Matcher, nodes: readonly RouteNode[]) {
  return matchNavigationStep(
    matcher,
    hopState.currentHref,
    nodes,
    hopState.initial.search,
    hopState.initial.hash,
  );
}

function withRedirectFlag(
  hopState: HopContext,
  step: MatchedNavigationTarget,
): MatchedNavigationTarget {
  return hopState.viaRedirect || step.viaRedirect ? { ...step, viaRedirect: true } : step;
}

function advanceRedirect(
  hopState: HopContext,
  nextHref: string,
  hop: number,
): RedirectHopError | null {
  const next = validateRedirectHop(hopState.visited, nextHref, hop, hopState.currentHref);
  if ('kind' in next) return next;
  hopState.currentHref = next.href;
  hopState.viaRedirect = true;
  return null;
}

function isRedirectContinue(value: unknown): value is RedirectHopContinue {
  return typeof value === 'object'
    && value !== null
    && 'kind' in value
    && (value as RedirectHopContinue).kind === 'redirect';
}

function runHopIteration<T>(
  hopState: HopContext,
  matcher: Matcher,
  nodes: readonly RouteNode[],
  hop: number,
  onMatched: (target: MatchedNavigationTarget) => T | RedirectHopContinue,
): HopIterationResult<T> {
  const matchStep = matchAt(hopState, matcher, nodes);
  if (!matchStep) return { action: 'return', value: { kind: 'unmatched' } };

  if (matchStep.kind === 'redirect') {
    const error = advanceRedirect(hopState, matchStep.href, hop);
    return error ? { action: 'return', value: error } : { action: 'retry' };
  }

  const outcome = onMatched(withRedirectFlag(hopState, matchStep));
  if (isRedirectContinue(outcome)) {
    const error = advanceRedirect(hopState, outcome.href, hop);
    return error ? { action: 'return', value: error } : { action: 'retry' };
  }

  return { action: 'return', value: outcome };
}

async function runHopIterationAsync<T>(
  hopState: HopContext,
  matcher: Matcher,
  nodes: readonly RouteNode[],
  hop: number,
  onMatched: (target: MatchedNavigationTarget) => Promise<T | RedirectHopContinue>,
): Promise<HopIterationResult<T>> {
  const matchStep = matchAt(hopState, matcher, nodes);
  if (!matchStep) return { action: 'return', value: { kind: 'unmatched' } };

  if (matchStep.kind === 'redirect') {
    const error = advanceRedirect(hopState, matchStep.href, hop);
    return error ? { action: 'return', value: error } : { action: 'retry' };
  }

  const outcome = await onMatched(withRedirectFlag(hopState, matchStep));
  if (isRedirectContinue(outcome)) {
    const error = advanceRedirect(hopState, outcome.href, hop);
    return error ? { action: 'return', value: error } : { action: 'retry' };
  }

  return { action: 'return', value: outcome };
}

function depthExceeded(hopState: HopContext): RedirectHopError {
  return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: hopState.currentHref };
}

function runRedirectHopLoop<T>(
  hopState: HopContext,
  matcher: Matcher,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => T | RedirectHopContinue,
): T | DeclarativeTargetResolve {
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const iteration = runHopIteration(hopState, matcher, nodes, hop, onMatched);
    if (iteration.action === 'retry') continue;
    return iteration.value;
  }
  return depthExceeded(hopState);
}

async function runRedirectHopLoopAsync<T>(
  hopState: HopContext,
  matcher: Matcher,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => Promise<T | RedirectHopContinue>,
): Promise<T | RedirectHopTerminal> {
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const iteration = await runHopIterationAsync(hopState, matcher, nodes, hop, onMatched);
    if (iteration.action === 'retry') continue;
    return iteration.value;
  }
  return depthExceeded(hopState);
}

/**
 * Sync redirect hop loop — declarative attr hops only.
 * @see resolveDeclarativeTarget
 */
export function followDeclarativeRedirectHops<T>(
  matcher: Matcher,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => T,
): T | DeclarativeTargetResolve {
  return runRedirectHopLoop(createHopContext(href), matcher, nodes, onMatched);
}

/**
 * Async redirect hop loop — declarative hops plus hook redirects from `onMatched`.
 * @see resolveRedirectChain
 */
export function followRedirectHopsWithHooks<T>(
  hopState: HopContext,
  matcher: Matcher,
  nodes: readonly RouteNode[],
  onMatched: (target: MatchedNavigationTarget) => Promise<T | RedirectHopContinue>,
): Promise<T | RedirectHopTerminal> {
  return runRedirectHopLoopAsync(hopState, matcher, nodes, onMatched);
}

export function isHopLoopTerminal(outcome: unknown): outcome is RedirectHopTerminal {
  return typeof outcome === 'object'
    && outcome !== null
    && 'kind' in outcome
    && ((outcome as DeclarativeTargetResolve).kind === 'unmatched'
      || (outcome as DeclarativeTargetResolve).kind === 'redirect-error');
}

import { resolveDocumentHrefParts, stripTrailingSlash } from '../../../aura-utils/misc/url';
import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import { NavigationTransaction } from '../navigation/navigation-transaction';
import type { CompletedBlockingPhases, PipelineStepResult } from '../navigation/types';
import type { RouteNode } from '../route-tree/route-node.types';
import { matchNavigationStep } from './match-hop';
import type { DeclarativeTargetResolve, MatchedNavigationTarget, RedirectHopError } from './types';

export const MAX_REDIRECT_HOPS = 5;

export type HopContext = {
  readonly initial: ResolvedDocumentHref;
  currentHref: string;
  readonly visited: Set<string>;
  viaRedirect: boolean;
  replace: boolean;
};

export type RedirectResolveResult =
  | {
      readonly status: 'resolved';
      readonly target: MatchedNavigationTarget;
      readonly replace: boolean;
      readonly completedBlockingPhases: CompletedBlockingPhases;
    }
  | { readonly status: 'unmatched' }
  | {
      readonly status: 'redirect-error';
      readonly code: 'redirect-cycle' | 'redirect-depth-exceeded';
      readonly href: string;
    }
  | { readonly status: 'terminal'; readonly result: Exclude<PipelineStepResult, null>; readonly probe: NavigationTransaction };

export type RedirectResolverContext = {
  readonly engine: AuraRoutingEngine;
  readonly matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;
  readonly getMatchableNodes: () => readonly RouteNode[];
  readonly isActive: () => boolean;
};

type RedirectChainInput = {
  readonly href: string | ResolvedDocumentHref;
  readonly from: MatchedRouteInfo | null;
  readonly action: HistoryAction;
  readonly hash: string;
  readonly options: NavigateHistoryOptions;
};

type Matcher = Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;

type HookRedirect = { readonly kind: 'redirect'; readonly href: string };

function isHookRedirect(
  outcome: RedirectResolveResult | HookRedirect,
): outcome is HookRedirect {
  return 'kind' in outcome && outcome.kind === 'redirect';
}


/** Normalized pathname key for redirect cycle detection (`/a` and `/a/` → same key). */
export function navigationVisitKey(href: string): string {
  return stripTrailingSlash(resolveDocumentHrefParts(href).pathname);
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

function applyRedirectHop(
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

function withViaRedirect(
  hopState: HopContext,
  step: MatchedNavigationTarget,
): MatchedNavigationTarget {
  return hopState.viaRedirect || step.viaRedirect ? { ...step, viaRedirect: true } : step;
}

function matchAt(
  hopState: HopContext,
  matcher: Matcher,
  nodes: readonly RouteNode[],
) {
  return matchNavigationStep(
    matcher,
    hopState.currentHref,
    nodes,
    hopState.initial.search,
    hopState.initial.hash,
  );
}

function depthExceeded(hopState: HopContext): RedirectHopError {
  return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: hopState.currentHref };
}

function toRedirectError(error: RedirectHopError): Extract<RedirectResolveResult, { status: 'redirect-error' }> {
  return { status: 'redirect-error', code: error.code, href: error.href };
}

/**
 * Sync target resolution — declarative `redirect` attr hops only (no hooks).
 *
 * Used by prefetch and any caller that needs a final leaf without running the navigation pipeline.
 * Redirect targets are path-only; `search` / `hash` from the original request are kept on the leaf.
 */
export function resolveDeclarativeTarget(
  matcher: Matcher,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
): DeclarativeTargetResolve {
  const hopState = createHopContext(href);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const step = matchAt(hopState, matcher, nodes);
    if (!step) return { kind: 'unmatched' };

    if (step.kind === 'redirect') {
      const error = applyRedirectHop(hopState, step.href, hop);
      if (error) return error;
      continue;
    }

    return withViaRedirect(hopState, step);
  }

  return depthExceeded(hopState);
}

/**
 * Pre-commit redirect resolution: declarative attr hops + blocking hooks (leave/guard/load)
 * without render. Returns the final navigation target for one full pipeline run.
 */
export async function resolveRedirectChain(
  resolverCtx: RedirectResolverContext,
  input: RedirectChainInput,
): Promise<RedirectResolveResult> {
  const hopState = createHopContext(input.href, input.options.replace ?? false);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const step = matchAt(hopState, resolverCtx.matcher, resolverCtx.getMatchableNodes());
    if (!step) return { status: 'unmatched' };

    if (step.kind === 'redirect') {
      const error = applyRedirectHop(hopState, step.href, hop);
      if (error) return toRedirectError(error);
      continue;
    }

    const outcome = await resolveMatchedHop(
      resolverCtx,
      input,
      withViaRedirect(hopState, step),
      hopState,
    );

    if (isHookRedirect(outcome)) {
      const error = applyRedirectHop(hopState, outcome.href, hop);
      if (error) return toRedirectError(error);
      continue;
    }

    return outcome;
  }

  return toRedirectError(depthExceeded(hopState));
}

async function resolveMatchedHop(
  resolverCtx: RedirectResolverContext,
  input: RedirectChainInput,
  target: MatchedNavigationTarget,
  hopState: HopContext,
): Promise<RedirectResolveResult | HookRedirect> {
  const probe = new NavigationTransaction(
    0,
    0,
    {
      from: input.from,
      to: target.leaf,
      href: target.href,
      hash: target.hash,
      action: input.action,
      options: input.options,
    },
    () => !resolverCtx.isActive(),
    resolverCtx.engine,
  );

  const probeResult = await probe.runBlockingProbe();

  if (probeResult?.status === 'redirect') {
    hopState.replace = hopState.replace || (probeResult.replace ?? input.action === 'pop');
    return { kind: 'redirect', href: probeResult.url };
  }

  if (probeResult) {
    return { status: 'terminal', result: probeResult, probe };
  }

  return {
    status: 'resolved',
    target,
    replace: hopState.replace || target.viaRedirect,
    completedBlockingPhases: {
      ...(probe.dataSnapshot && { dataSnapshot: probe.dataSnapshot }),
    },
  };
}

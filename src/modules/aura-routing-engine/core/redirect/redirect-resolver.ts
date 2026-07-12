import { resolveDocumentHrefParts, stripTrailingSlash } from '../../../aura-utils/misc/url';
import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import { NavigationTransaction } from '../navigation/navigation-transaction';
import type { CompletedBlockingPhases, PipelineStepResult } from '../navigation/types';
import type { RouteNode } from '../route-tree/route-node.types';
import { lookupNavigationStep } from './match-step';
import type { DeclarativeRedirectOutcome, MatchedNavigationTarget, RedirectErrorOutcome } from './types';

export const MAX_REDIRECTION_STEPS = 5;

export type RedirectionContext = {
  readonly originalUrlParts: ResolvedDocumentHref;
  stepHref: string;
  readonly visitedPathnames: Set<string>;
  viaRedirect: boolean;
  historyReplace: boolean;
};

export type RedirectResolveResult =
  | {
  readonly status: 'resolved';
  readonly target: MatchedNavigationTarget;
  readonly replace: boolean;
  readonly completedBlockingPhases: CompletedBlockingPhases;
}
  | { readonly status: 'unmatched' }
  | RedirectErrorOutcome
  | {
  readonly status: 'terminal';
  readonly result: Exclude<PipelineStepResult, null>;
  readonly probe: NavigationTransaction
};

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
  readonly options: NavigateHistoryOptions;
};

type Matcher = Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;

type BlockingPhasesProbeOutcome =
  | { readonly done: true; readonly result: RedirectResolveResult }
  | { readonly done: false; readonly href: string };

/** Normalized pathname key for redirect cycle detection (`/a` and `/a/` → same key). */
export function navigationVisitKey(href: string): string {
  return stripTrailingSlash(resolveDocumentHrefParts(href).pathname);
}

export function createRedirectionContext(href: string | ResolvedDocumentHref, replace = false): RedirectionContext {
  const originalUrlParts = typeof href === 'string' ? resolveDocumentHrefParts(href) : href;
  return {
    originalUrlParts,
    stepHref: originalUrlParts.href,
    visitedPathnames: new Set([stripTrailingSlash(originalUrlParts.pathname)]),
    viaRedirect: false,
    historyReplace: replace,
  };
}

function applyRedirectStep(
  redirection: RedirectionContext,
  nextHref: string,
  step: number,
): RedirectErrorOutcome | null {
  if (step >= MAX_REDIRECTION_STEPS) {
    return { status: 'redirect-error', code: 'redirect-depth-exceeded', href: redirection.stepHref };
  }
  const nextKey = navigationVisitKey(nextHref);
  if (redirection.visitedPathnames.has(nextKey)) {
    return { status: 'redirect-error', code: 'redirect-cycle', href: nextHref };
  }
  redirection.visitedPathnames.add(nextKey);
  redirection.stepHref = nextHref;
  redirection.viaRedirect = true;
  return null;
}

function applyRedirectArrivalFlag(
  redirection: RedirectionContext,
  step: MatchedNavigationTarget,
): MatchedNavigationTarget {
  return redirection.viaRedirect || step.viaRedirect ? { ...step, viaRedirect: true } : step;
}

function depthExceeded(redirection: RedirectionContext): RedirectErrorOutcome {
  return { status: 'redirect-error', code: 'redirect-depth-exceeded', href: redirection.stepHref };
}

/**
 * Sync target resolution — declarative `redirect` attr steps only (no hooks).
 *
 * Used by prefetch and any caller that needs a final leaf without running the navigation pipeline.
 * Redirect targets are path-only; `search` / `hash` from the original request are kept on the leaf.
 */
export function followDeclarativeRedirects(
  matcher: Matcher,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
): DeclarativeRedirectOutcome {
  const redirection = createRedirectionContext(href);

  for (let step = 0; step <= MAX_REDIRECTION_STEPS; step++) {
    const matchStep = lookupNavigationStep(
      matcher,
      redirection.stepHref,
      nodes,
      redirection.originalUrlParts.search,
      redirection.originalUrlParts.hash,
    );
    if (!matchStep) return { status: 'unmatched' };

    if (matchStep.kind === 'redirect') {
      const error = applyRedirectStep(redirection, matchStep.href, step);
      if (error) return error;
      continue;
    }

    return {
      status: 'resolved',
      target: applyRedirectArrivalFlag(redirection, matchStep),
    };
  }

  return depthExceeded(redirection);
}

/**
 * Pre-commit redirect resolution: declarative attr steps + blocking hooks (leave/guard/load)
 * without render. Returns the final navigation target for one full pipeline run.
 */
export async function followRedirectsWithBlockingPhases(
  resolverCtx: RedirectResolverContext,
  input: RedirectChainInput,
): Promise<RedirectResolveResult> {
  const redirection = createRedirectionContext(input.href, input.options.replace ?? false);

  for (let step = 0; step <= MAX_REDIRECTION_STEPS; step++) {
    const matchStep = lookupNavigationStep(
      resolverCtx.matcher,
      redirection.stepHref,
      resolverCtx.getMatchableNodes(),
      redirection.originalUrlParts.search,
      redirection.originalUrlParts.hash,
    );
    if (!matchStep) return { status: 'unmatched' };

    if (matchStep.kind === 'redirect') {
      const error = applyRedirectStep(redirection, matchStep.href, step);
      if (error) return error;
      continue;
    }

    const matched = await runTransactionBlockingPhases(
      resolverCtx,
      input,
      applyRedirectArrivalFlag(redirection, matchStep),
      redirection,
    );

    if (!matched.done) {
      const error = applyRedirectStep(redirection, matched.href, step);
      if (error) return error;
      continue;
    }

    return matched.result;
  }

  return depthExceeded(redirection);
}

async function runTransactionBlockingPhases(
  resolverCtx: RedirectResolverContext,
  input: RedirectChainInput,
  target: MatchedNavigationTarget,
  redirection: RedirectionContext,
): Promise<BlockingPhasesProbeOutcome> {
  const probe = new NavigationTransaction(
    0,
    0,
    {
      from: input.from,
      to: target,
      href: target.href,
      hash: target.hash,
      action: input.action,
      options: input.options,
    },
    () => !resolverCtx.isActive(),
    resolverCtx.engine,
  );

  const probeResult = await probe.runBlockingPhases();

  if (probeResult?.status === 'redirect') {
    redirection.historyReplace = redirection.historyReplace || (probeResult.replace ?? input.action === 'pop');
    return { done: false, href: probeResult.url };
  }

  if (probeResult) {
    return { done: true, result: { status: 'terminal', result: probeResult, probe } };
  }

  return {
    done: true,
    result: {
      status: 'resolved',
      target,
      replace: redirection.historyReplace || target.viaRedirect,
      completedBlockingPhases: {
        ...(probe.dataSnapshot && { dataSnapshot: probe.dataSnapshot }),
      },
    },
  };
}

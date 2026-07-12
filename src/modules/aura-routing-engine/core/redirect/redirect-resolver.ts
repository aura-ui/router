import { resolveDocumentHrefParts, stripTrailingSlash } from '../../../aura-utils/misc/url';
import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { RouteNode } from '../route-tree/route-node.types';
import { NavigationTransaction } from '../navigation/navigation-transaction';
import { lookupNavigationStep } from './match-step';
import type {
  BlockingPhasesProbeOutcome,
  DeclarativeRedirectOutcome,
  MatchedNavigationTarget,
  RedirectChainInput,
  RedirectErrorOutcome,
  RedirectMatcher,
  RedirectResolveResult,
  RedirectResolverContext,
  RedirectionContext,
} from './types';

/** Max loop index before `redirect-depth-exceeded` (`step >=` this value on a redirect hop). */
export const MAX_REDIRECTION_STEPS = 5;

/**
 * Normalized pathname key for redirect cycle detection.
 * `/a` and `/a/` resolve to the same key.
 */
export function navigationVisitKey(href: string): string {
  return stripTrailingSlash(resolveDocumentHrefParts(href).pathname);
}

/**
 * Creates the initial redirect-chain context for a navigation href.
 *
 * @param href - Raw href or pre-resolved document parts.
 * @param replace - Initial `historyReplace` flag from navigation options.
 */
export function createRedirectionContext(
  href: string | ResolvedDocumentHref,
  replace = false,
): RedirectionContext {
  const originalUrlParts = typeof href === 'string' ? resolveDocumentHrefParts(href) : href;
  return {
    originalUrlParts,
    stepHref: originalUrlParts.href,
    visitedPathnames: new Set([stripTrailingSlash(originalUrlParts.pathname)]),
    viaRedirect: false,
    historyReplace: replace,
  };
}

/**
 * Validates depth/cycle guards and advances the chain to `nextHref`.
 *
 * @returns `RedirectErrorOutcome` when the hop is invalid; `null` when applied.
 */
function tryApplyRedirectStep(
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

/**
 * Marks the final leaf with `viaRedirect` when any hop ran in this chain.
 * Used by the coordinator to choose `history.replace` vs `push`.
 */
function applyRedirectArrivalFlag(
  redirection: RedirectionContext,
  target: MatchedNavigationTarget,
): MatchedNavigationTarget {
  return redirection.viaRedirect || target.viaRedirect ? { ...target, viaRedirect: true } : target;
}

/** Defensive fallthrough when the redirect loop exits without a terminal outcome. */
function depthExceeded(redirection: RedirectionContext): RedirectErrorOutcome {
  return { status: 'redirect-error', code: 'redirect-depth-exceeded', href: redirection.stepHref };
}

/**
 * Sync declarative redirect resolution — `redirect` attr steps only (no hooks).
 *
 * Used by prefetch and any caller that needs a final leaf without running the navigation pipeline.
 * Redirect targets are path-only; `search` / `hash` from the original request are kept on the leaf.
 */
export function followDeclarativeRedirects(
  matcher: RedirectMatcher,
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
    if (!matchStep) return { status: 'unmatched', href: redirection.stepHref };

    if (matchStep.kind === 'redirect') {
      const error = tryApplyRedirectStep(redirection, matchStep.href, step);
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
 * Pre-commit redirect resolution: declarative attr steps + guard walk (hook redirect),
 * without history commit or render. Returns the target and probe metadata for
 * {@link ../navigation/navigation-coordinator!NavigationCoordinator.run} — does not run the full pipeline itself.
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
    if (!matchStep) return { status: 'unmatched', href: redirection.stepHref };

    if (matchStep.kind === 'redirect') {
      const error = tryApplyRedirectStep(redirection, matchStep.href, step);
      if (error) return error;
      continue;
    }

    const blockingOutcome = await runGuardWalkProbe(
      resolverCtx,
      input,
      applyRedirectArrivalFlag(redirection, matchStep),
      redirection,
    );

    if (!blockingOutcome.done) {
      const error = tryApplyRedirectStep(redirection, blockingOutcome.href, step);
      if (error) return error;
      continue;
    }

    return blockingOutcome.result;
  }

  return depthExceeded(redirection);
}

/**
 * Guard-only probe on one candidate leaf during redirect walk (no leave/load/render).
 */
async function runGuardWalkProbe(
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

  const walkResult = await probe.runGuardPhase();

  if (walkResult?.status === 'redirect') {
    redirection.historyReplace = redirection.historyReplace || (walkResult.replace ?? input.action === 'pop');
    return { done: false, href: walkResult.url };
  }

  if (walkResult) {
    return { done: true, result: { status: 'terminal', result: walkResult, probe } };
  }

  return {
    done: true,
    result: {
      status: 'resolved',
      target,
      replace: redirection.historyReplace || target.viaRedirect,
    },
  };
}

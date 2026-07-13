import { resolveDocumentHrefParts, type ResolvedDocumentHref } from '../link-active/app-href';
import { stripTrailingSlash } from '../../../aura-utils/misc/url';
import type { RouteNode } from '../route-tree/route-node.types';
import { buildTransitionPlan, getEnterRoute, type TransitionMap } from '../route-tree/transition-plan';
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
    blockingPhasesCompleted: false,
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
 * Pre-commit redirect resolution: declarative attr steps + blocking walk (`leave` → `guard`),
 * without history commit or render.
 *
 * Blocking walk runs {@link ../navigation/navigation-transaction!NavigationTransaction.runRedirectCollapse}
 * on each hop where the transition plan has `hasLeave` on exit or `hasGuard` on enter.
 * Full `runGuards()` is invoked per hop (overlapping exit routes may run `leave` more than once —
 * acceptable for short chains; see `redirect/README.md`).
 *
 * Resolved navigations set {@link RedirectResolveResult.skipBlockingPhases} so
 * {@link ../navigation/navigation-coordinator!NavigationCoordinator.run} skips duplicate
 * `runGuards` in the full pipeline.
 */
export async function followRedirectsWithGuardWalk(
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

    const target = applyRedirectArrivalFlag(redirection, matchStep);
    const transitionPlan = buildTransitionPlan(input.from, target);

    const blockingOutcome = planNeedsBlockingWalk(transitionPlan)
      ? await runBlockingWalkProbe(resolverCtx, input, target, redirection, transitionPlan)
      : resolveWithoutBlockingWalkProbe(target, redirection);

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
 * Whether this hop needs redirect-walk blocking probe.
 *
 * True when exit routes declare `leave` or enter routes declare `guard` in the
 * pre-built plan for `from → target`. No incremental dedup — each matching hop runs full
 * {@link ../navigation/navigation-transaction-pipeline!NavigationTransactionPipeline.runGuards}.
 */
function planNeedsBlockingWalk(plan: TransitionMap): boolean {
  return (
    plan.exitRoutes.some((matched) => matched.route.hasLeave)
    || plan.enterRoutes.some((matched) => matched.route.hasGuard)
  );
}

/** Leaf resolved without blocking work on this hop (may still set `skipBlockingPhases` from prior hops). */
function resolveWithoutBlockingWalkProbe(
  target: MatchedNavigationTarget,
  redirection: RedirectionContext,
): BlockingPhasesProbeOutcome {
  return {
    done: true,
    result: {
      status: 'resolved',
      target,
      replace: redirection.historyReplace || target.viaRedirect,
      skipBlockingPhases: redirection.blockingPhasesCompleted,
    },
  };
}

/**
 * `leave` → `guard` probe for one redirect-walk hop.
 *
 * Uses a throwaway probe transaction (`id 0`) with a preset {@link TransitionMap}.
 * Preserves pipeline phase order so hook `guard` redirect never runs before exit `leave`.
 */
async function runBlockingWalkProbe(
  resolverCtx: RedirectResolverContext,
  input: RedirectChainInput,
  target: MatchedNavigationTarget,
  redirection: RedirectionContext,
  transitionPlan: TransitionMap,
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

  probe.transitionPlan = transitionPlan;
  probe.transitionOrder = getEnterRoute(transitionPlan)?.transition?.order ?? null;

  const walkResult = await probe.runRedirectCollapse();
  redirection.blockingPhasesCompleted = true;

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
      skipBlockingPhases: true,
    },
  };
}

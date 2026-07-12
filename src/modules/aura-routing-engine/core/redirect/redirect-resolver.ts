import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import { NavigationTransaction } from '../navigation/navigation-transaction';
import type { CompletedBlockingPhases, PipelineStepResult } from '../navigation/types';
import type { RouteNode } from '../route-tree/route-node.types';
import {
  createHopContext,
  followDeclarativeRedirectHops,
  followNavigationRedirectHops,
  isDeclarativeTerminal,
  shouldReplace,
  type HopContext,
} from './hop-loop';
import type { DeclarativeTargetResolve, MatchedNavigationTarget } from './types';

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

export type RedirectChainContext = {
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

/**
 * Sync target resolution — declarative `redirect` attr hops only (no hooks).
 *
 * Used by prefetch and any caller that needs a final leaf without running the navigation pipeline.
 * Redirect targets are path-only; `search` / `hash` from the original request are kept on the leaf.
 */
export function resolveDeclarativeTarget(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
): DeclarativeTargetResolve {
  return followDeclarativeRedirectHops(
    matcher,
    href,
    nodes,
    (target: MatchedNavigationTarget) => target,
  );
}

/**
 * Pre-commit redirect resolution: declarative attr hops + blocking hooks (leave/guard/load)
 * without render. Returns the final navigation target for one full pipeline run.
 */
export async function resolveRedirectChain(
  ctx: RedirectChainContext,
  input: RedirectChainInput,
): Promise<RedirectResolveResult> {
  const hopCtx = createHopContext(input.href, input.options.replace ?? false);

  const outcome = await followNavigationRedirectHops<RedirectResolveResult>(
    hopCtx,
    ctx.matcher,
    ctx.getMatchableNodes(),
    async (target) => resolveMatchedHop(ctx, input, target, hopCtx),
  );

  if (isDeclarativeTerminal(outcome)) {
    if (outcome.kind === 'unmatched') return { status: 'unmatched' };
    return { status: 'redirect-error', code: outcome.code, href: outcome.href };
  }

  return outcome;
}

async function resolveMatchedHop(
  ctx: RedirectChainContext,
  input: RedirectChainInput,
  target: MatchedNavigationTarget,
  hopCtx: HopContext,
): Promise<RedirectResolveResult | { kind: 'redirect'; href: string }> {
  const probe = createBlockingProbe(ctx, {
    from: input.from,
    to: target.leaf,
    href: target.href,
    hash: target.hash,
    action: input.action,
    options: input.options,
  });

  const blocking = await probe.runBlockingProbe();

  if (blocking?.status === 'redirect') {
    hopCtx.replace = hopCtx.replace || (blocking.replace ?? input.action === 'pop');
    return { kind: 'redirect', href: blocking.url };
  }

  if (blocking) {
    return { status: 'terminal', result: blocking, probe };
  }

  return {
    status: 'resolved',
    target,
    replace: shouldReplace(hopCtx, target),
    completedBlockingPhases: {
      ...(probe.dataSnapshot && { dataSnapshot: probe.dataSnapshot }),
    },
  };
}

function createBlockingProbe(
  ctx: RedirectChainContext,
  options: {
    from: MatchedRouteInfo | null;
    to: MatchedRouteInfo;
    href: string;
    hash: string;
    action: HistoryAction;
    options: NavigateHistoryOptions;
  },
): NavigationTransaction {
  return new NavigationTransaction(
    0,
    0,
    options,
    () => !ctx.isActive(),
    ctx.engine,
  );
}

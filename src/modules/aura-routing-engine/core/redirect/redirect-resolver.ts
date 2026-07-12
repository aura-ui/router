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
  followRedirectHopsWithHooks,
  isHopLoopTerminal,
  shouldReplaceHistory,
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
  resolverCtx: RedirectResolverContext,
  input: RedirectChainInput,
): Promise<RedirectResolveResult> {
  const hopState = createHopContext(input.href, input.options.replace ?? false);

  const outcome = await followRedirectHopsWithHooks<RedirectResolveResult>(
    hopState,
    resolverCtx.matcher,
    resolverCtx.getMatchableNodes(),
    async (target) => resolveMatchedHop(resolverCtx, input, target, hopState),
  );

  if (isHopLoopTerminal(outcome)) {
    if (outcome.kind === 'unmatched') return { status: 'unmatched' };
    return { status: 'redirect-error', code: outcome.code, href: outcome.href };
  }

  return outcome;
}

async function resolveMatchedHop(
  resolverCtx: RedirectResolverContext,
  input: RedirectChainInput,
  target: MatchedNavigationTarget,
  hopState: HopContext,
): Promise<RedirectResolveResult | { kind: 'redirect'; href: string }> {
  const probe = createBlockingProbe(resolverCtx, {
    from: input.from,
    to: target.leaf,
    href: target.href,
    hash: target.hash,
    action: input.action,
    options: input.options,
  });

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
    replace: shouldReplaceHistory(hopState, target),
    completedBlockingPhases: {
      ...(probe.dataSnapshot && { dataSnapshot: probe.dataSnapshot }),
    },
  };
}

function createBlockingProbe(
  resolverCtx: RedirectResolverContext,
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
    () => !resolverCtx.isActive(),
    resolverCtx.engine,
  );
}

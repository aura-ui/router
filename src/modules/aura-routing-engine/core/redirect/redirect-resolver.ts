import { resolveDocumentHrefParts, type ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import {
  advanceRedirectHop,
  MAX_REDIRECT_HOPS,
  matchNavigationStep,
  navigationVisitKey,
  type MatchedNavigationTarget,
} from '../match/resolve-navigation-target';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import { NavigationTransaction } from '../navigation/navigation-transaction';
import type { PipelineStepResult, CompletedBlockingPhases } from '../navigation/types';
import type { RouteNode } from '../route-tree/route-node.types';

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

type RedirectResolveInput = {
  readonly href: string | ResolvedDocumentHref;
  readonly from: MatchedRouteInfo | null;
  readonly action: HistoryAction;
  readonly hash: string;
  readonly options: NavigateHistoryOptions;
};

/**
 * Pre-commit redirect resolution: declarative attr hops + blocking hooks (leave/guard/load)
 * without render. Returns the final navigation target for one full pipeline run.
 */
export async function resolveRedirectChain(
  ctx: RedirectResolverContext,
  input: RedirectResolveInput,
): Promise<RedirectResolveResult> {
  const initial = typeof input.href === 'string' ? resolveDocumentHrefParts(input.href) : input.href;
  const nodes = ctx.getMatchableNodes();

  let currentHref = initial.href;
  let replace = input.options.replace ?? false;
  let redirected = false;
  const visited = new Set<string>([navigationVisitKey(currentHref)]);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const step = matchNavigationStep(
      ctx.matcher,
      currentHref,
      nodes,
      initial.search,
      initial.hash,
    );

    if (!step) return { status: 'unmatched' };

    if (step.kind === 'redirect') {
      const next = advanceRedirectHop(visited, step.href, hop, currentHref);
      if ('kind' in next) {
        return { status: 'redirect-error', code: next.code, href: next.href };
      }
      currentHref = next.href;
      redirected = true;
      replace = true;
      continue;
    }

    const probe = createBlockingProbe(ctx, {
      from: input.from,
      to: step.leaf,
      href: step.href,
      hash: step.hash,
      action: input.action,
      options: input.options,
    });

    const blocking = await probe.runBlockingProbe();

    if (blocking?.status === 'redirect') {
      const hookReplace = blocking.replace ?? (input.action === 'pop');
      const next = advanceRedirectHop(visited, blocking.url, hop, currentHref);
      if ('kind' in next) {
        return { status: 'redirect-error', code: next.code, href: next.href };
      }
      currentHref = next.href;
      replace = replace || hookReplace;
      redirected = true;
      continue;
    }

    if (blocking) {
      return { status: 'terminal', result: blocking, probe };
    }

    return {
      status: 'resolved',
      target: redirected || step.viaRedirect ? { ...step, viaRedirect: true } : step,
      replace,
      completedBlockingPhases: {
        ...(probe.dataSnapshot && { dataSnapshot: probe.dataSnapshot }),
      },
    };
  }

  return { status: 'redirect-error', code: 'redirect-depth-exceeded', href: currentHref };
}

function createBlockingProbe(
  ctx: RedirectResolverContext,
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

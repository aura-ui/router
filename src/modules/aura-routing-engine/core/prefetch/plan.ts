import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import { followDeclarativeRedirects } from '../redirect/redirect-resolver';
import { getActiveChain } from '../route-tree/matched-chain';
import type { RouteNode } from '../route-tree/route-node.types';
import { buildTransitionPlan } from '../route-tree/transition-plan';

import { PrefetchPolicy } from './policy';
import type { PrefetchPlan } from './types';

export type PrefetchPlanResolverDeps = {
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'buildMatchedRouteInfo'>;
  getMatchableNodes: () => readonly RouteNode[];
  getRegistryGeneration: () => number;
  currentHref?: () => string;
};

/** Match href -> branch plan with LCA delta and registry-generation cache. */
export class PrefetchPlanResolver {
  private readonly deps: PrefetchPlanResolverDeps;
  private readonly policy = new PrefetchPolicy();
  private readonly cache = new Map<string, { generation: number; plan: PrefetchPlan }>();

  constructor(deps: PrefetchPlanResolverDeps) {
    this.deps = deps;
  }

  resolve(href: string): PrefetchPlan | null {
    const normalized = this.policy.normalizeHref(href);
    if (!normalized) return null;

    const nodes = this.deps.getMatchableNodes();
    const from = this.resolveCurrentLeaf(nodes);
    const planKey = this.planCacheKey(normalized, from);
    const generation = this.deps.getRegistryGeneration();
    const cached = this.cache.get(planKey);
    if (cached && cached.generation === generation) {
      return cached.plan;
    }

    const outcome = followDeclarativeRedirects(this.deps.matcher, normalized, nodes);
    if (outcome.status !== 'resolved') return null;

    const target = outcome.target;
    const transition = buildTransitionPlan(from, target);

    const plan: PrefetchPlan = {
      href: target.href,
      pathname: target.pathname,
      search: target.search,
      hash: target.hash,
      leaf: target,
      chain: getActiveChain(target),
      enterRoutes: transition.enterRoutes,
      lca: transition.lca,
      registryGeneration: generation,
    };

    this.cache.set(planKey, { generation, plan });
    return plan;
  }

  clear(): void {
    this.cache.clear();
  }

  private resolveCurrentLeaf(nodes: readonly RouteNode[]): MatchedRouteInfo | null {
    const currentHref = this.deps.currentHref?.();
    if (!currentHref) return null;

    const normalized = this.policy.normalizeHref(currentHref);
    if (!normalized) return null;

    const outcome = followDeclarativeRedirects(this.deps.matcher, normalized, nodes);
    return outcome.status === 'resolved' ? outcome.target : null;
  }

  private planCacheKey(href: string, from: MatchedRouteInfo | null): string {
    return `${href}|from:${from?.href ?? ''}`;
  }
}

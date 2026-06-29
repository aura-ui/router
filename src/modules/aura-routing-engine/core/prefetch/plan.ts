import { resolveNavigationTarget } from '../match/resolve-navigation-target';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import { buildTransitionPlan } from '../route-tree/transition-plan';
import type { RouteNode } from '../route-tree/route-node.types';
import { PrefetchPolicy } from './policy';
import type { PrefetchPlan } from './types';

export type PrefetchPlanResolverDeps = {
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;
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
    const cacheKey = this.cacheKey(normalized, from);
    const generation = this.deps.getRegistryGeneration();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.generation === generation) {
      return cached.plan;
    }

    const target = resolveNavigationTarget(this.deps.matcher, normalized, nodes);
    if (!target) return null;

    const transition = buildTransitionPlan(from, target.leaf);

    const plan: PrefetchPlan = {
      href: target.href,
      pathname: target.pathname,
      search: target.search,
      hash: target.hash,
      leaf: target.leaf,
      chain: target.chain,
      enterRoutes: transition.enterRoutes,
      lca: transition.lca,
      registryGeneration: generation,
    };

    this.cache.set(cacheKey, { generation, plan });
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

    return resolveNavigationTarget(this.deps.matcher, normalized, nodes)?.leaf ?? null;
  }

  private cacheKey(href: string, from: MatchedRouteInfo | null): string {
    return `${href}|from:${from?.href ?? ''}`;
  }
}

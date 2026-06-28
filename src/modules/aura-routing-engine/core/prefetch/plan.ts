import { resolveNavigationTarget } from '../match/resolve-navigation-target';
import type { AuraRoutingUrlMatcher } from '../match/url-matcher';
import type { RouteNode } from '../route-tree/route-node.types';
import { normalizePrefetchHref } from './policy';
import type { PrefetchPlan } from './types';

export type PrefetchPlanResolverDeps = {
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;
  getMatchableNodes: () => readonly RouteNode[];
  getRegistryGeneration: () => number;
};

/** Match href → branch plan with registry-generation cache. */
export class PrefetchPlanResolver {
  private readonly deps: PrefetchPlanResolverDeps;
  private readonly cache = new Map<string, { generation: number; plan: PrefetchPlan }>();

  constructor(deps: PrefetchPlanResolverDeps) {
    this.deps = deps;
  }

  resolve(href: string): PrefetchPlan | null {
    const normalized = normalizePrefetchHref(href);
    if (!normalized) return null;

    const generation = this.deps.getRegistryGeneration();
    const cached = this.cache.get(normalized);
    if (cached && cached.generation === generation) {
      return cached.plan;
    }

    const target = resolveNavigationTarget(
      this.deps.matcher,
      normalized,
      this.deps.getMatchableNodes(),
    );
    if (!target) return null;

    const plan: PrefetchPlan = {
      href: target.href,
      pathname: target.pathname,
      search: target.search,
      hash: target.hash,
      leaf: target.leaf,
      chain: target.chain,
      registryGeneration: generation,
    };

    this.cache.set(normalized, { generation, plan });
    return plan;
  }

  clear(): void {
    this.cache.clear();
  }
}

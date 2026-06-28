import { parsePath } from '../../../aura-utils/misc/url';
import { getActiveChain } from '../route-tree/matched-chain';
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

    const { pathname, search, hash } = parsePath(normalized);
    const found = this.deps.matcher.matchPath(pathname, this.deps.getMatchableNodes());
    if (!found) return null;

    const leaf = this.deps.matcher.toRouteInfo(
      normalized,
      pathname,
      search,
      hash,
      found.node,
      found.params,
    );

    const plan: PrefetchPlan = {
      href: normalized,
      pathname,
      search,
      hash,
      leaf,
      chain: getActiveChain(leaf),
      registryGeneration: generation,
    };

    this.cache.set(normalized, { generation, plan });
    return plan;
  }

  clear(): void {
    this.cache.clear();
  }
}

import type { ViewLoadPort } from '../view-graph';
import type { DataGraph } from '../data-graph';
import { routeHasLoadHooks } from '../data-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  VIEW_PREFETCH_MIN_CONFIDENCE,
  PrefetchPolicy,
} from './policy';
import type {
  PrefetchPlan,
  PrefetchPlanContext,
  PrefetchResource,
  PrefetchResourceExecutor,
  PrefetchResourcePlanner,
  PrefetchResourcePriority,
  PrefetchResourceRunContext,
  PrefetchResourceScheduler as PrefetchResourceSchedulerPort,
} from './types';

export type DefaultPrefetchResourcePlannerOptions = {
  readonly view?: boolean;
  readonly data?: boolean;
};

const PRIORITY_WEIGHT: Record<PrefetchResourcePriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/**
 * Default ISNR planner: enterRoutes → view and/or data resources by confidence tier.
 */
export class DefaultPrefetchResourcePlanner implements PrefetchResourcePlanner {
  private readonly policy: PrefetchPolicy;
  private readonly viewEnabled: boolean;
  private readonly dataEnabled: boolean;

  constructor(
    options: DefaultPrefetchResourcePlannerOptions = {},
    policy: PrefetchPolicy = new PrefetchPolicy(),
  ) {
    this.policy = policy;
    this.viewEnabled = options.view ?? true;
    this.dataEnabled = options.data ?? true;
  }

  planResources(plan: PrefetchPlan, ctx: PrefetchPlanContext): readonly PrefetchResource[] {
    const resources: PrefetchResource[] = [];

    const view = this.planView(plan, ctx);
    if (view) resources.push(view);

    const data = this.planData(plan, ctx);
    if (data) resources.push(data);

    return resources;
  }

  explainEmptyPlan(
    plan: PrefetchPlan,
    ctx: PrefetchPlanContext,
  ): 'low-confidence' | 'no-targets' {
    const hasViewTargets = plan.enterRoutes.some((route) => this.routeHasView(route));
    if (this.viewEnabled && hasViewTargets && !this.policy.shouldPrefetchView(ctx)) {
      return 'low-confidence';
    }

    const hasDataTargets = plan.enterRoutes.some(routeHasLoadHooks);
    if (this.dataEnabled && hasDataTargets && !this.policy.shouldPrefetchData(ctx)) {
      return 'low-confidence';
    }

    return 'no-targets';
  }

  private planView(plan: PrefetchPlan, ctx: PrefetchPlanContext): PrefetchResource | null {
    if (!this.viewEnabled || !this.policy.shouldPrefetchView(ctx)) return null;

    const targets = plan.enterRoutes.filter((route) => this.routeHasView(route));
    if (!targets.length) return null;

    return {
      kind: 'view',
      targets,
      priority: ctx.confidence >= VIEW_PREFETCH_MIN_CONFIDENCE ? 'high' : 'normal',
    };
  }

  private planData(plan: PrefetchPlan, ctx: PrefetchPlanContext): PrefetchResource | null {
    if (!this.dataEnabled || !this.policy.shouldPrefetchData(ctx)) return null;

    const targets = plan.enterRoutes.filter(routeHasLoadHooks);
    if (!targets.length) return null;

    return {
      kind: 'data',
      targets,
      priority: 'high',
    };
  }

  private routeHasView(routeInfo: MatchedRouteInfo): boolean {
    return routeInfo.route.hasViewContent;
  }
}

/** Dispatches planned resources to kind-specific executors (parallel, priority-ordered). */
export class PrefetchResourceScheduler implements PrefetchResourceSchedulerPort {
  private readonly executorsByKind: ReadonlyMap<PrefetchResource['kind'], PrefetchResourceExecutor>;

  constructor(executors: readonly PrefetchResourceExecutor[]) {
    this.executorsByKind = new Map(executors.map((executor) => [executor.kind, executor]));
  }

  async run(
    resources: readonly PrefetchResource[],
    ctx: PrefetchResourceRunContext,
  ): Promise<void> {
    const ordered = [...resources].sort(
      (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority],
    );

    await Promise.all(ordered.map((resource) => this.runResource(resource, ctx)));
  }

  private runResource(resource: PrefetchResource, ctx: PrefetchResourceRunContext): Promise<void> {
    const executor = this.executorsByKind.get(resource.kind);
    if (!executor) return Promise.resolve();
    return executor.run(resource, ctx);
  }
}

/** Prefetch view payloads via shared {@link ViewGraph} cache. */
export class ViewPrefetchExecutor implements PrefetchResourceExecutor {
  readonly kind = 'view' as const;

  private readonly viewGraph: ViewLoadPort;

  constructor(viewGraph: ViewLoadPort) {
    this.viewGraph = viewGraph;
  }

  run(resource: PrefetchResource, ctx: PrefetchResourceRunContext): Promise<void> {
    if (resource.kind !== 'view') return Promise.resolve();
    return this.viewGraph.prefetchBranch(resource.targets, ctx.signal);
  }
}

/** Prefetch load-hook data via {@link DataGraph}. */
export class DataPrefetchExecutor implements PrefetchResourceExecutor {
  readonly kind = 'data' as const;

  private readonly dataGraph: DataGraph;

  constructor(dataGraph: DataGraph) {
    this.dataGraph = dataGraph;
  }

  run(resource: PrefetchResource, ctx: PrefetchResourceRunContext): Promise<void> {
    if (resource.kind !== 'data') return Promise.resolve();
    return this.dataGraph.prefetch(resource.targets, { signal: ctx.signal, mode: 'intent' });
  }
}

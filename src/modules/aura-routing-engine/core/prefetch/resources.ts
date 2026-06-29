import type { ContentLoadService } from '../content/content-load-service';
import type { DataGraph } from '../data-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  CONTENT_PREFETCH_MIN_CONFIDENCE,
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
  readonly content?: boolean;
  readonly data?: boolean;
};

const PRIORITY_WEIGHT: Record<PrefetchResourcePriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/**
 * Default ISNR planner: enterRoutes → content and/or data resources by confidence tier.
 */
export class DefaultPrefetchResourcePlanner implements PrefetchResourcePlanner {
  private readonly policy: PrefetchPolicy;
  private readonly contentEnabled: boolean;
  private readonly dataEnabled: boolean;

  constructor(
    options: DefaultPrefetchResourcePlannerOptions = {},
    policy: PrefetchPolicy = new PrefetchPolicy(),
  ) {
    this.policy = policy;
    this.contentEnabled = options.content ?? true;
    this.dataEnabled = options.data ?? true;
  }

  planResources(plan: PrefetchPlan, ctx: PrefetchPlanContext): readonly PrefetchResource[] {
    const resources: PrefetchResource[] = [];

    const content = this.planContent(plan, ctx);
    if (content) resources.push(content);

    const data = this.planData(plan, ctx);
    if (data) resources.push(data);

    return resources;
  }

  explainEmptyPlan(
    plan: PrefetchPlan,
    ctx: PrefetchPlanContext,
  ): 'low-confidence' | 'no-targets' {
    const hasContentTargets = plan.enterRoutes.some((route) => this.routeHasView(route));
    if (this.contentEnabled && hasContentTargets && !this.policy.shouldPrefetchContent(ctx)) {
      return 'low-confidence';
    }

    const hasDataTargets = plan.enterRoutes.some((route) => this.routeHasLoadHooks(route));
    if (this.dataEnabled && hasDataTargets && !this.policy.shouldPrefetchData(ctx)) {
      return 'low-confidence';
    }

    return 'no-targets';
  }

  private planContent(plan: PrefetchPlan, ctx: PrefetchPlanContext): PrefetchResource | null {
    if (!this.contentEnabled || !this.policy.shouldPrefetchContent(ctx)) return null;

    const targets = plan.enterRoutes.filter((route) => this.routeHasView(route));
    if (!targets.length) return null;

    return {
      kind: 'content',
      targets,
      priority: ctx.confidence >= CONTENT_PREFETCH_MIN_CONFIDENCE ? 'high' : 'normal',
    };
  }

  private planData(plan: PrefetchPlan, ctx: PrefetchPlanContext): PrefetchResource | null {
    if (!this.dataEnabled || !this.policy.shouldPrefetchData(ctx)) return null;

    const targets = plan.enterRoutes.filter((route) => this.routeHasLoadHooks(route));
    if (!targets.length) return null;

    return {
      kind: 'data',
      targets,
      priority: 'high',
    };
  }

  private routeHasView(routeInfo: MatchedRouteInfo): boolean {
    const route = routeInfo.route as {
      layout?: string;
      view?: { type?: string } | null;
    };

    return Boolean(route.layout || route.view?.type);
  }

  private routeHasLoadHooks(routeInfo: MatchedRouteInfo): boolean {
    return Boolean(routeInfo.route.load?.length);
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

/** Prefetch html-src / template partials via shared ContentLoadService cache. */
export class ContentPrefetchExecutor implements PrefetchResourceExecutor {
  readonly kind = 'content' as const;

  private readonly content: ContentLoadService;

  constructor(content: ContentLoadService) {
    this.content = content;
  }

  run(resource: PrefetchResource, ctx: PrefetchResourceRunContext): Promise<void> {
    if (resource.kind !== 'content') return Promise.resolve();
    return this.content.prefetchBranch(resource.targets, ctx.signal);
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

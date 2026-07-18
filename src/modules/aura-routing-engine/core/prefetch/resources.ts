import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  VIEW_PREFETCH_MIN_CONFIDENCE,
  PrefetchPolicy,
} from './policy';
import type {
  PrefetchPlan,
  PrefetchPlanContext,
  PrefetchResource,
  PrefetchResourcePlanner,
} from './types';

export type DefaultPrefetchResourcePlannerOptions = {
  readonly view?: boolean;
  readonly data?: boolean;
};

/**
 * Default ISNR planner: enterRoutes → view and/or data resources by confidence tier.
 * PrefetchPipeline turns planned kinds into `{ data, view }` flags for speculative prepare.
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

    const hasDataTargets = plan.enterRoutes.some((route) => route.route.hasLoad);
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

    const targets = plan.enterRoutes.filter((route) => route.route.hasLoad);
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

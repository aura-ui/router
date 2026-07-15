import { type DataGraph, type DataGraphLoadResult, type DataSnapshot } from '../data-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { PipelineStepResult } from '../navigation/types';
import type { ViewGraph } from '../view-graph';

export type ResourceGraphMode = 'navigation' | 'speculative';

export type ResourceGraphRunContext = {
  mode: ResourceGraphMode;
  /** Full active branch (root → leaf), including LCA parents outside enterRoutes. */
  branch: readonly MatchedRouteInfo[];
  signal: AbortSignal;
  transaction: NavigationTransaction;
};

export type ResourceGraphLoadPlan = {
  /** Enter routes with `load` — run via DataGraph (parallel; `ctx.parent()` opt-in join). */
  dataRoutes: readonly MatchedRouteInfo[];
  /**
   * Enter routes whose view/content can start without waiting for load payloads.
   * Runs in parallel with {@link dataRoutes}.
   */
  contentRoutes: readonly MatchedRouteInfo[];
  dataBoundContentRoutes: readonly MatchedRouteInfo[];
};

export type ResourceGraphResolveResult = {
  outcome?: PipelineStepResult;
  snapshot?: DataSnapshot;
};

/**
 * Coordinates data + view prepare for an enter branch.
 * Data stays parallel in {@link DataGraph} (child may `await ctx.parent()`);
 * independent content loads run alongside data.
 *
 * Not wired into {@link NavigationTransactionPipeline} yet.
 */
export class ResourceGraph {
  readonly viewGraph: ViewGraph;
  readonly dataGraph: DataGraph;

  private mode!: ResourceGraphMode;
  private branch!: readonly MatchedRouteInfo[];
  private enterRoutes!: readonly MatchedRouteInfo[];
  private signal!: AbortSignal;
  private transaction!: NavigationTransaction; // todo remove

  constructor(viewGraph: ViewGraph, dataGraph: DataGraph) {
    this.viewGraph = viewGraph;
    this.dataGraph = dataGraph;
  }

  private get isNavigationMode(): boolean {
    return this.mode === 'navigation';
  }

  resolve(enterRoutes: readonly MatchedRouteInfo[], context: ResourceGraphRunContext): Promise<ResourceGraphResolveResult> {
    this.mode = context.mode;
    this.signal = context.signal;
    this.branch = context.branch;
    this.transaction = context.transaction;
    this.enterRoutes = enterRoutes;
    const plan = this.buildLoadPlan();
    return this.isNavigationMode ? this.load(plan) : this.prefetch(plan);
  }

  /**
   * Splits enter routes into data vs independent content buckets.
   */
  buildLoadPlan(enterRoutes: readonly MatchedRouteInfo[] = this.enterRoutes): ResourceGraphLoadPlan {
    const dataRoutes: MatchedRouteInfo[] = [];
    const contentRoutes: MatchedRouteInfo[] = [];
    const dataBoundContentRoutes: MatchedRouteInfo[] = [];

    for (const matched of enterRoutes) {
      const { route } = matched;
      route.hasLoad && dataRoutes.push(matched);

      // Match ViewGraph.buildViewDescriptor: layout wins over view; template never needsData.
      const layout =
        typeof route.layout === 'string' ? route.layout.trim() : '';
      if (layout) {
        contentRoutes.push(matched);
      } else if (route.view?.loader) {
        route.viewLoaderNeedsData
          ? dataBoundContentRoutes.push(matched)
          : contentRoutes.push(matched);
      }
    }

    return { dataRoutes, contentRoutes, dataBoundContentRoutes };
  }

  private async load(plan: ResourceGraphLoadPlan): Promise<ResourceGraphResolveResult> {
    const { dataRoutes, contentRoutes, dataBoundContentRoutes } = plan;

    const dataPromise: Promise<DataGraphLoadResult> = dataRoutes.length
      ? this.dataGraph.load(dataRoutes, { branch: this.branch, transaction: this.transaction })
      : Promise.resolve({});

    const contentPromise = Promise.all(
      contentRoutes.map((route) => this.viewGraph.loadView(route, this.signal)),
    );

    const [dataResult] = await Promise.all([dataPromise, contentPromise]);

    if (dataResult.outcome) return dataResult; // was issue

    const dataBoundContentPromise = Promise.all(
      dataBoundContentRoutes.map((route) => {
        const { snapshot } = dataResult;
        const data = snapshot?.get(route.dataKey!);
        return this.viewGraph.loadView(route, this.signal, { data });
      }),
    );

    await Promise.all([dataBoundContentPromise]);

    return dataResult;
  }

  private async prefetch(plan: ResourceGraphLoadPlan): Promise<ResourceGraphResolveResult> {
    const { dataRoutes, contentRoutes, dataBoundContentRoutes } = plan;
    let parts: Promise<unknown>[] = [];

    if (dataRoutes.length) {
      parts.push(this.dataGraph.prefetch(dataRoutes, { signal: this.signal, mode: 'intent' }));
    }

    if (contentRoutes.length) {
      parts.push(this.viewGraph.prefetchBranch(contentRoutes, this.signal));
    }

    if (parts.length) {
      await Promise.all(parts);
    }

    if (dataBoundContentRoutes.length) {
      // todo check data
      parts = [];
      parts.push(this.viewGraph.prefetchBranch(dataBoundContentRoutes, this.signal));
      await Promise.all(parts);
    }

    return {};
  }
}

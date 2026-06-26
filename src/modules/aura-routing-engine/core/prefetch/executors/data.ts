import type { PrefetchExecutor, PrefetchPlan, PrefetchRunContext } from '../types';

/** Placeholder until DataGraph exists. */
export class DataPrefetchExecutor implements PrefetchExecutor {
  readonly id = 'data';

  async run(plan: PrefetchPlan, _ctx: PrefetchRunContext): Promise<void> {
    if (!plan.chain.some((info) => info.route.load?.length)) return;
    // TODO: dataGraph.prefetch(plan, ctx)
  }
}

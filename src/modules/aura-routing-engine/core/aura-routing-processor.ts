import { buildRoadMap } from './aura-routing-transition-map';
import {
  PhaseExecutor,
  type NavigationTransaction,
  type TransactionResult,
} from './aura-routing-phase-executor';
import type { MatchedRouteInfo } from './aura-routing-url-matcher';
import type { HistoryAction } from './navigation-provider.types';
import type { RouterInstance } from '../../aura-route-hooks/core';
import { AuraRoutingProcessorJobManager } from './aura-routing-processor-job-manager';
import {
  DEFAULT_TRANSITION_POLICY,
  type TransitionPolicy,
} from './aura-routing-transition-policy';

export class AuraRoutingProcessor {
  private readonly jobManager = new AuraRoutingProcessorJobManager();
  private readonly phases = new PhaseExecutor();
  private readonly transitionPolicy: TransitionPolicy;

  constructor(transitionPolicy: TransitionPolicy = DEFAULT_TRANSITION_POLICY) {
    this.transitionPolicy = transitionPolicy;
  }

  async run(input: {
    from: MatchedRouteInfo | null;
    to: MatchedRouteInfo;
    action: HistoryAction;
    router: RouterInstance;
  }): Promise<TransactionResult> {
    const transaction: NavigationTransaction = {
      ...input,
      plan: buildRoadMap(input.from, input.to),
      transitionPolicy: this.transitionPolicy,
    };

    const job = this.jobManager.begin();
    const generation = this.jobManager.routerGeneration;
    const phaseContext = {
      transaction,
      job,
      router: input.router,
      isJobActive: () => !this.jobManager.isJobSuperseded(job, generation),
    };

    if (transaction.plan.reenter) {
      const early = await this.phases.runReenter(phaseContext);
      return early ?? { status: 'committed' };
    }

    const steps = [
      () => this.phases.runGuards(phaseContext),
      () => this.phases.runLoads(phaseContext),
      () => this.phases.runRenderWithTransition(phaseContext),
      () => this.phases.runAfterRender(phaseContext),
    ] as const;

    for (const step of steps) {
      const result = await step();
      if (result) return result;
    }

    return { status: 'committed' };
  }

  stop(): void {
    this.jobManager.invalidate();
  }
}

import { buildTransitionPlan } from '../transition/plan';
import {
  ProcessorPipeline,
  type NavigationTransaction,
  type TransactionResult,
} from './processor-pipeline';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { HistoryAction } from '../history/provider.types';
import type { RouterInstance } from '../../../aura-route-hooks/core';
import { AuraRoutingProcessorJobManager } from './job-manager';
import {
  DEFAULT_TRANSITION_POLICY,
  type TransitionPolicy,
} from '../transition/policy';

export class AuraRoutingProcessor {
  private readonly jobManager = new AuraRoutingProcessorJobManager();
  private readonly pipeline = new ProcessorPipeline();
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
      plan: buildTransitionPlan(input.from, input.to),
      transitionPolicy: this.transitionPolicy,
    };

    const job = this.jobManager.begin();
    const generation = this.jobManager.routerGeneration;
    const pipelineContext = {
      transaction,
      job,
      router: input.router,
      isJobActive: () => !this.jobManager.isJobSuperseded(job, generation),
    };

    if (transaction.plan.reenter) {
      const reenterOutcome = await this.pipeline.runReenter(pipelineContext);
      return reenterOutcome ?? { status: 'committed' };
    }

    const steps = [
      () => this.pipeline.runGuards(pipelineContext),
      () => this.pipeline.runLoads(pipelineContext),
      () => this.pipeline.runRenderWithTransition(pipelineContext),
      () => this.pipeline.runAfterRender(pipelineContext),
    ] as const;

    for (const step of steps) {
      const stepOutcome = await step();
      if (stepOutcome) return stepOutcome;
    }

    return { status: 'committed' };
  }

  stop(): void {
    this.jobManager.invalidate();
  }
}

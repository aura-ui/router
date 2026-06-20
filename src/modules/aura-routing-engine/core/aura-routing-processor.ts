import { buildRoadMap } from './aura-routing-transition-map';
import {
  PhaseExecutor,
  type NavigationTransaction,
  type TransactionResult,
} from './aura-routing-phase-executor';
import type { MatchedRouteInfo } from './aura-routing-url-matcher';
import type { HistoryAction } from './aura-routing-history-navigator';
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
  }): Promise<TransactionResult> {
    const tx: NavigationTransaction = {
      ...input,
      plan: buildRoadMap(input.from, input.to),
      transitionPolicy: this.transitionPolicy,
    };

    const job = this.jobManager.begin();
    const generation = this.jobManager.routerGeneration;
    const ctx = {
      tx,
      job,
      isJobActive: () => !this.jobManager.isJobSuperseded(job, generation),
    };

    if (tx.plan.reentered) {
      const early = await this.phases.runReentered(ctx);
      return early ?? { status: 'committed' };
    }

    const steps = [
      () => this.phases.runGuards(ctx),
      () => this.phases.runLoads(ctx),
      () => this.phases.runTransition(ctx),
      () => this.phases.runPostCommit(ctx),
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

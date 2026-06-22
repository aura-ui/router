import { buildTransitionPlan } from '../transition/plan';
import {
  ProcessorPipeline,
  type NavigationTransaction,
  type ProcessorRunInput,
  type TransactionResult,
} from './processor-pipeline';
import { AuraRoutingProcessorJobManager } from './job-manager';
import {
  DEFAULT_TRANSITION_POLICY,
  type TransitionPolicy,
} from '../transition/policy';

export type { ProcessorRunInput };

/**
 * Navigation transaction orchestrator used by {@link AuraRoutingEngine}.
 *
 * Builds the transition plan, starts a superseding {@link AuraRoutingProcessorJob},
 * and delegates lifecycle phases to {@link ProcessorPipeline}.
 *
 * View commit (`viewCommitted`) happens here; history URL commit — in the engine after success.
 */
export class AuraRoutingProcessor {
  private readonly jobManager = new AuraRoutingProcessorJobManager();
  private readonly pipeline = new ProcessorPipeline();
  private readonly transitionPolicy: TransitionPolicy;

  /** @param transitionPolicy — order of render vs transition-out/in (default {@link DEFAULT_TRANSITION_POLICY}). */
  constructor(transitionPolicy: TransitionPolicy = DEFAULT_TRANSITION_POLICY) {
    this.transitionPolicy = transitionPolicy;
  }

  /**
   * Runs one navigation transaction (guards → loads → view commit → post-commit).
   * @param input — matched `from`/`to`, history action, and router instance for hooks
   */
  async run(input: ProcessorRunInput): Promise<TransactionResult> {
    const transaction: NavigationTransaction = {
      ...input,
      plan: buildTransitionPlan(input.from, input.to),
      transitionPolicy: this.transitionPolicy,
    };

    const job = this.jobManager.begin();
    const generation = this.jobManager.routerGeneration;

    return this.pipeline.run({
      transaction,
      job,
      router: input.router,
      isJobActive: () => !this.jobManager.isJobSuperseded(job, generation),
    });
  }

  /** Router teardown / re-setup: abort in-flight job and bump `routerGeneration`. */
  invalidate(): void {
    this.jobManager.invalidate();
  }
}

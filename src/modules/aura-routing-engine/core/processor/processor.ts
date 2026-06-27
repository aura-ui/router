import { buildTransitionPlan, getEnterRoute } from '../transition/plan';
import { HookRunner } from '../hooks/runner';
import type { HookRegistry } from '../hooks/registry';
import { defaultHookRegistry } from '../hooks/registry';
import {
  ProcessorPipeline,
  type NavigationTransaction,
  type ProcessorRunInput,
  type TransactionResult,
} from './processor-pipeline';
import { AuraRoutingProcessorJobManager } from './job-manager';

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
  private readonly hookRunner: HookRunner;

  constructor(hookRegistry: HookRegistry = defaultHookRegistry) {
    this.hookRunner = new HookRunner(hookRegistry);
  }

  /**
   * Runs one navigation transaction (guards → loads → view commit → post-commit).
   * @param input — matched `from`/`to`, history action, and router instance for hooks
   */
  async run(input: ProcessorRunInput): Promise<TransactionResult> {
    const plan = buildTransitionPlan(input.from, input.to);

    const transaction: NavigationTransaction = {
      ...input,
      plan,
      transitionOrder: getEnterRoute(plan)?.transition?.order ?? null,
    };

    const job = this.jobManager.begin();
    const generation = this.jobManager.routerGeneration;

    return this.pipeline.run({
      transaction,
      job,
      router: input.router,
      hookRunner: this.hookRunner,
      isJobActive: () => !this.jobManager.isJobSuperseded(job, generation),
    });
  }

  /** Router teardown / re-setup: abort in-flight job and bump `routerGeneration`. */
  invalidate(): void {
    this.jobManager.invalidate();
  }
}

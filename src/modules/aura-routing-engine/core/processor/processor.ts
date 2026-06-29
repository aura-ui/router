import { buildTransitionPlan, getEnterRoute } from '../route-tree/transition-plan';
import type { HookRegistry } from '../hooks/registry';
import { defaultHookRegistry } from '../hooks/registry';
import {
  ProcessorPipeline,
  type NavigationTransaction,
} from './processor-pipeline';
import type { ProcessorRunInput } from './types';
import type { TransactionResult } from '../navigation/transaction-result';
import { ViewCommitTracker } from '../view-mount/view-commit-tracker';
import { withCancelledTransactionScope } from './cancellation/transaction-scope';
import { AuraRoutingProcessorJobManager } from './cancellation/job-manager';
import { canUseFastPath } from './fast-path/can-use-fast-path';
import { runFastPath } from './fast-path/run-fast-path';

/**
 * Navigation transaction orchestrator used by {@link AuraRoutingEngine}.
 *
 * Builds the transition plan, starts a superseding {@link AuraRoutingProcessorJob},
 * and delegates lifecycle phases to {@link ProcessorPipeline}.
 *
 * View mount tracking happens here; history URL commit — in the engine after pipeline success.
 */
export class AuraRoutingProcessor {
  private readonly jobManager = new AuraRoutingProcessorJobManager();
  private readonly pipeline = new ProcessorPipeline();
  private readonly hookRegistry: HookRegistry;

  constructor(hookRegistry: HookRegistry = defaultHookRegistry) {
    this.hookRegistry = hookRegistry;
  }

  /**
   * Runs one navigation transaction (guards → loads → view commit → post-commit).
   * @param input — matched `from`/`to`, history action, and router instance for hooks
   */
  async run(input: ProcessorRunInput): Promise<TransactionResult> {
    const transitionPlan = buildTransitionPlan(input.from, input.to);

    const transaction: NavigationTransaction = {
      from: input.from,
      to: input.to,
      action: input.action,
      plan: transitionPlan,
      transitionOrder: getEnterRoute(transitionPlan)?.transition?.order ?? null,
    };

    const navigationJob = this.jobManager.begin();
    const capturedRouterGeneration = this.jobManager.routerGeneration;
    const viewCommitTracker = new ViewCommitTracker(input.to.href);

    return withCancelledTransactionScope({
      transitionPlan,
      navigationJob,
      viewCommitTracker,
      runTransaction: () => {
        const pipelineContext = {
          transaction,
          navigationJob,
          router: input.router,
          hookRegistry: this.hookRegistry,
          viewCommitTracker,
          reportHookError: input.reportHookError,
          commitGate: input.commitGate,
          isJobActive: () =>
            !this.jobManager.isJobSuperseded(navigationJob, capturedRouterGeneration),
        };

        if (canUseFastPath(transitionPlan, input.from, input.to)) {
          return runFastPath(pipelineContext);
        }

        return this.pipeline.run(pipelineContext);
      },
    });
  }

  /** Router teardown / re-setup: abort in-flight job and bump `routerGeneration`. */
  invalidate(): void {
    this.jobManager.invalidate();
  }

  /**
   * Aborts the in-flight navigation without starting a new transaction.
   * Used when the user clicks the already-committed route while another href is pending.
   */
  abortPendingNavigation(): void {
    this.jobManager.active?.abort();
  }
}

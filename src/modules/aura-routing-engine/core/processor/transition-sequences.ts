import type { PipelineContext } from './processor-pipeline';
import type { TransactionResult } from '../navigation/transaction-result';

type PipelineOutcome = TransactionResult | null;

/** Async sub-step; returns terminal outcome or `null` to continue the sequence. */
export type PipelineStep = (pipelineContext: PipelineContext) => Promise<PipelineOutcome>;

type SequentialTransitionPolicy = 'out-in' | 'in-out';

type TransitionStepRunner = {
  runExitTransition: PipelineStep;
  runRender: PipelineStep;
  runEnterTransition: PipelineStep;
};

/**
 * Render + transition step order per {@link TransitionPolicy}.
 *
 * `parallel` is handled separately in {@link ProcessorPipeline.runParallelRenderWithTransition}.
 */
export const TRANSITION_RENDER_SEQUENCES: Record<
  SequentialTransitionPolicy,
  (runner: TransitionStepRunner) => PipelineStep[]
> = {
  'out-in': (runner) => [
    runner.runExitTransition,
    runner.runRender,
    runner.runEnterTransition,
  ],
  'in-out': (runner) => [
    runner.runRender,
    runner.runEnterTransition,
    runner.runExitTransition,
  ],
};

import type { GuardResult } from '../guard.types';
import type { RoutePhase } from '../lifecycle/types';
import type { RouteLifecycleContext } from '../route/types';
import { runPhaseHooks, type HookRegistry } from './registry';
import { guardResultToPhaseOutcome, type PhaseStepOutcome } from '../lifecycle/phase-runner';

export interface PhaseHookRunnerContext {
  hookRegistry: HookRegistry;
  isJobActive: () => boolean;
}

/** Blocking hooks: `false` cancels, redirect URL stops navigation. */
export async function runBlockingPhaseHooks(
  lifecycleContext: RouteLifecycleContext,
  ctx: PhaseHookRunnerContext,
  hookNames: readonly string[],
): Promise<PhaseStepOutcome> {
  const hookResult = await runPhaseHooks(
    ctx.hookRegistry,
    lifecycleContext,
    hookNames,
    ctx.isJobActive,
  );

  return guardResultToPhaseOutcome(hookResult);
}

/** Post-commit hooks with `hookErrors: 'log'`; errors are logged, not propagated. */
export async function runLoggedPostCommitHooks(
  lifecycleContext: RouteLifecycleContext,
  ctx: PhaseHookRunnerContext,
  hookNames: readonly string[],
): Promise<GuardResult> {
  try {
    return await runPhaseHooks(
      ctx.hookRegistry,
      lifecycleContext,
      hookNames,
      ctx.isJobActive,
    );
  } catch (error) {
    console.error(`[${lifecycleContext.phase}] hook failed after view commit:`, error);
    return undefined;
  }
}

/** Logs cancel/redirect from post-commit hooks; navigation already committed. */
export function warnIgnoredPostCommitHookResult(
  lifecyclePhase: RoutePhase,
  hookResult: GuardResult,
): void {
  if (hookResult === false) {
    console.warn(`[${lifecyclePhase}] hook returned false after view commit — ignored`);
    return;
  }

  const redirect = guardResultToPhaseOutcome(hookResult);
  if (redirect?.status === 'redirect') {
    console.warn(
      `[${lifecyclePhase}] hook returned redirect after view commit — ignored: ${redirect.url}`,
    );
  }
}

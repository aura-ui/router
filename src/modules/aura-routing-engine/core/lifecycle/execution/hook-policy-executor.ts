import type { GuardResult } from '../../guard.types';
import { runPhaseHooks, type HookRegistry } from '../../hooks/registry';
import type { RouteLifecycleContext } from '../../route/types';
import { defaultLifecycleLogger, type LifecycleLogger } from '../logging/lifecycle-logger';
import type { PostCommitHookErrors, RoutePhase } from '../types';

import { guardResultToPhaseOutcome, type PhaseStepOutcome } from './phase-outcome';

export interface HookPolicyContext {
  hookRegistry: HookRegistry;
  isJobActive: () => boolean;
}

export interface PostCommitHookPolicyOptions {
  onLoggedError?: (error: unknown) => void;
}

/** Executes lifecycle hooks according to blocking/post-commit policy. */
export class HookPolicyExecutor {
  private readonly logger: LifecycleLogger;

  constructor(logger: LifecycleLogger = defaultLifecycleLogger) {
    this.logger = logger;
  }

  async runBlocking(
    lifecycleContext: RouteLifecycleContext,
    ctx: HookPolicyContext,
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

  async runPostCommit(
    lifecycleContext: RouteLifecycleContext,
    ctx: HookPolicyContext,
    hookNames: readonly string[],
    onError: PostCommitHookErrors,
    lifecyclePhase: RoutePhase,
    options: PostCommitHookPolicyOptions = {},
  ): Promise<PhaseStepOutcome> {
    const hookResult =
      onError === 'log'
        ? await this.runLoggedPostCommit(lifecycleContext, ctx, hookNames, options)
        : await runPhaseHooks(
            ctx.hookRegistry,
            lifecycleContext,
            hookNames,
            ctx.isJobActive,
          );

    this.warnIgnoredPostCommitHookResult(lifecyclePhase, hookResult);
    return null;
  }

  private async runLoggedPostCommit(
    lifecycleContext: RouteLifecycleContext,
    ctx: HookPolicyContext,
    hookNames: readonly string[],
    options: PostCommitHookPolicyOptions,
  ): Promise<GuardResult> {
    try {
      return await runPhaseHooks(
        ctx.hookRegistry,
        lifecycleContext,
        hookNames,
        ctx.isJobActive,
      );
    } catch (error) {
      if (options.onLoggedError) {
        options.onLoggedError(error);
      } else {
        this.logger.postCommitHookFailed(lifecycleContext.phase, error);
      }
      return undefined;
    }
  }

  private warnIgnoredPostCommitHookResult(
    lifecyclePhase: RoutePhase,
    hookResult: GuardResult,
  ): void {
    if (hookResult === false) {
      this.logger.postCommitCancelIgnored(lifecyclePhase);
      return;
    }

    const redirect = guardResultToPhaseOutcome(hookResult);
    if (redirect?.status === 'redirect') {
      this.logger.postCommitRedirectIgnored(lifecyclePhase, redirect.url);
    }
  }
}

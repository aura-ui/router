import type { GuardResult } from '../../aura-routing-engine/core';

function isTerminalGuardResult(result: GuardResult): result is false | string {
  return result === false || typeof result === 'string';
}

export type NavigationPrepareHandlers = {
  /**
   * Exit guard(s) for the leaving route(s).
   * Should return `false` to cancel, or `string` to redirect.
   */
  leave?: () => Promise<GuardResult> | GuardResult;
  /**
   * Enter guard(s) for the target route(s).
   * Should return `false` to cancel, or `string` to redirect.
   */
  enter?: () => Promise<GuardResult> | GuardResult;
  /**
   * Data loading for the target route(s).
   * Should return `false` to cancel, or `string` to redirect.
   */
  load?: () => Promise<GuardResult> | GuardResult;
};

export type NavigationPostHandlers = {
  /** Non-blocking effects before teardown (animation out). */
  leaving?: () => Promise<void> | void;
  /** Non-blocking teardown + cleanup. */
  left?: () => Promise<void> | void;
  /** Non-blocking effects before showing (animation in). */
  entering?: () => Promise<void> | void;
  /** Non-blocking effects after showing. */
  entered?: () => Promise<void> | void;
};

/**
 * NavigationCoordinator orchestrates a single navigation as a transaction:
 *
 * - prepare: guards + loads (no UI commit)
 * - commit: render / patch UI (commit point)
 * - post: effects and cleanup (non-blocking)
 *
 * Not wired yet — intended for stage 3+ (see docs/IMPLEMENTATION_STEPS.md).
 */
export class NavigationCoordinator {
  async runPrepare(handlers: NavigationPrepareHandlers): Promise<GuardResult> {
    if (handlers.leave) {
      const result = await handlers.leave();
      if (isTerminalGuardResult(result)) return result;
    }

    if (handlers.enter) {
      const result = await handlers.enter();
      if (isTerminalGuardResult(result)) return result;
    }

    if (handlers.load) {
      const result = await handlers.load();
      if (isTerminalGuardResult(result)) return result;
    }

    return undefined;
  }

  async runCommit(render: () => Promise<void> | void): Promise<void> {
    await render();
  }

  async runPost(handlers: NavigationPostHandlers): Promise<void> {
    await handlers.leaving?.();
    await handlers.left?.();
    await handlers.entering?.();
    await handlers.entered?.();
  }

  async runError(errorHandler: () => Promise<void> | void): Promise<void> {
    await errorHandler();
  }

  async runReentered(reenteredHandler: () => Promise<void> | void): Promise<void> {
    await reenteredHandler();
  }
}


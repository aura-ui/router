/* eslint-disable no-console -- This adapter is the single console boundary for lifecycle diagnostics. */

import type { RoutePhase } from '../types';

export interface LifecycleLogger {
  phaseFailedAfterCommit(phase: RoutePhase, error: unknown): void;
  postCommitHookFailed(phase: RoutePhase, error: unknown): void;
  postCommitCancelIgnored(phase: RoutePhase): void;
  postCommitRedirectIgnored(phase: RoutePhase, url: string): void;
}

/** Single console boundary for lifecycle diagnostics. */
export class ConsoleLifecycleLogger implements LifecycleLogger {
  phaseFailedAfterCommit(phase: RoutePhase, error: unknown): void {
    console.error(`[${phase}] failed after commit:`, error);
  }

  postCommitHookFailed(phase: RoutePhase, error: unknown): void {
    console.error(`[${phase}] hook failed after view commit:`, error);
  }

  postCommitCancelIgnored(phase: RoutePhase): void {
    console.warn(`[${phase}] hook returned false after view commit — ignored`);
  }

  postCommitRedirectIgnored(phase: RoutePhase, url: string): void {
    console.warn(`[${phase}] hook returned redirect after view commit — ignored: ${url}`);
  }
}

export const defaultLifecycleLogger: LifecycleLogger = new ConsoleLifecycleLogger();

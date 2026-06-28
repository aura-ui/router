import type { CommitSnapshot } from '../processor/view-mount/view-mount-state';
import { isViewCommittedForHistory } from '../processor/view-mount/view-mount-state';
import type { NavigationFailureCode } from '../failure/navigation-error';
import type { TransactionResult } from '../processor/processor-pipeline';
import type { HistoryAction, NavigateHistoryOptions } from './provider.types';

/**
 * History side-effect after processor outcome.
 *
 * - `preserve` — address bar unchanged (cancelled push, pre-render error)
 * - `commit-target` — pushState / replaceState to navigation target
 * - `rollback-source` — pop cancelled/error: restore `from` URL
 */
export type HistoryPolicy = 'preserve' | 'commit-target' | 'rollback-source';

export interface HistoryApplyContext {
  href: string;
  fromHref: string | null;
  options: NavigateHistoryOptions;
}

export interface HistoryProviderLike {
  commit(url: string, options: NavigateHistoryOptions): void;
  rollback(url: string): void;
}

export interface ResolveHistoryOptions {
  syncHistory?: boolean;
}

/** History policy for a terminal navigation error (`NOT_FOUND` or pipeline failure). */
export function resolveErrorHistoryPolicy(
  code: NavigationFailureCode,
  commit: CommitSnapshot,
  action: HistoryAction,
  options: ResolveHistoryOptions = {},
): HistoryPolicy {
  if (code === 'NOT_FOUND') {
    if (options.syncHistory !== false && (action === 'push' || action === 'replace')) {
      return 'commit-target';
    }
    return 'preserve';
  }

  if (isViewCommittedForHistory(commit)) return 'commit-target';
  return action === 'pop' ? 'rollback-source' : 'preserve';
}

/** Maps processor outcome + history action to a single history policy. */
export function resolveHistoryPolicy(
  result: TransactionResult,
  action: HistoryAction,
  options: ResolveHistoryOptions = {},
): HistoryPolicy {
  switch (result.status) {
    case 'viewCommitted':
      return 'commit-target';

    case 'redirect':
      return 'preserve';

    case 'cancelled':
      return action === 'pop' ? 'rollback-source' : 'preserve';

    case 'error':
      return resolveErrorHistoryPolicy(
        result.failure.error.code,
        result.failure.commit,
        action,
        options,
      );
  }
}

/** Applies {@link HistoryPolicy} via the navigation provider. */
export function applyHistoryPolicy(
  policy: HistoryPolicy,
  ctx: HistoryApplyContext,
  provider: HistoryProviderLike,
): void {
  switch (policy) {
    case 'commit-target':
      provider.commit(ctx.href, ctx.options);
      break;
    case 'rollback-source':
      if (ctx.fromHref) provider.rollback(ctx.fromHref);
      break;
    case 'preserve':
      break;
  }
}

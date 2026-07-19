# Failure Layer

`failure/` owns the **structured failure model** only — codes, normalization, and
`FailedNavigation` snapshots. Import from `core/failure` (barrel).

Terminal **side effects** (app callbacks, `prev`, history) live in
`navigation/navigation-outcome.ts` (`applyNavigationOutcome`).
Observability is `NavigationPulse` (observe-only).

## Structure

- `navigation-error.ts` — stable failure codes, phase attribution, `unknown` → `NavigationError`.
- `navigation-failure.ts` — `FailedNavigation` terminal snapshot for pipeline, history policy, and bus payloads.

## Ownership Boundaries

`failure/` does **not**:

- run app callbacks (`onNotFound`, …) or mutate `prev`;
- write history;
- emit on the EventBus;
- execute route lifecycle hooks (`error` phase → `navigation/pipeline-failure.ts`).

Route lifecycle on failure:

- `pipeline-failure.ts` — terminal `error` phase after pipeline failure;
- `unmount-prev-on-not-found.ts` — callback-only `unmount` before pre-match `NOT_FOUND` apply.

History policy: `history/history-policy.ts` (`applyTransactionHistory`).

## Recovery (apply layer, not here)

- `NOT_FOUND` → `onNotFound` / fallback / `setPrev(null)` via `applyNavigationOutcome`.
- Pipeline / redirect-cycle errors → bus `navigation:error` via `NavigationPulse.settle`.
- Committed view failure → `setPrev(failure.to)` via apply path.

History behavior is derived from `FailedNavigation.error.code` and
`FailedNavigation.commit` by `resolveErrorHistoryPolicy()`.

# Failure Layer

`failure/` owns the **structured failure model** only. Import from `core/failure` (barrel).

## Error vs failure

| Concept | Type | Meaning |
| --- | --- | --- |
| **Error** | `NavigationError` | Structured *cause* — `code`, `phase`, `message`, `cause` |
| **Failure** | `NavigationFailure` | Terminal *snapshot* of the attempt — `error` + `from` / `to` / `commit` / `action` |

```
unknown throw / NOT_FOUND / redirect cycle
        ↓ normalizeNavigationError()
  NavigationError              ← cause
        ↓ NavigationFailure.fromPipeline / .notFound / …
  NavigationFailure            ← failed navigation
        ↓ toResult()
  { status: 'error', failure }
```

Terminal **side effects** (app callbacks, `prev`, history) live in
`navigation/navigation-outcome.ts` (`applyNavigationOutcome`).
Observability is `NavigationPulse` (observe-only).

## Structure

- `navigation-error.ts` — `NavigationFailureCode`, phase attribution, `unknown` → `NavigationError`.
- `navigation-failure.ts` — `NavigationFailure` terminal snapshot for pipeline, history policy, and bus payloads.

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

- `NOT_FOUND` → `onNotFound` / `setPrev(null)` via `applyNavigationOutcome`.
- Pipeline / redirect-cycle errors → bus `navigation:error` via `NavigationPulse.settle`.
- Committed view failure → `setPrev(failure.to)` via apply path.

History behavior is derived from `NavigationFailure.error.code` and
`NavigationFailure.commit` by `resolveErrorHistoryPolicy()`.

# Failure Layer

`failure/` owns the structured navigation failure model used after match,
pipeline, render, and content-load errors.

Import from `core/failure` (barrel) rather than deep paths unless you are editing
files inside this folder.

## Structure

- `navigation-error.ts` defines stable failure codes, phase attribution, and the
  single normalization path from `unknown` to `NavigationError`.
- `navigation-failure.ts` defines `FailedNavigation`, the terminal failure
  snapshot passed through processor, navigation finalization, callbacks, and
  history policy.
- `finalize-failure.ts` runs app failure callbacks and returns the `prev` update
  hint. It does not write history.

## Ownership Boundaries

`failure/` does not execute route lifecycle callbacks or registered hooks.
Route lifecycle on failure lives in `navigation/`:

- `navigation-failure-handler.ts` — terminal `error` phase (`onError` + attr hooks)
  after a pipeline failure and assembled `FailedNavigation`.
- `not-found-exit-cleanup.ts` — callback-only `unmount` on the previous leaf
  before pre-match `NOT_FOUND` finalization.

History writes are resolved in `history/` and applied in `navigation/navigation-finalize.ts`.
This keeps failure callbacks, `prev` updates, and browser history policy separate.

## Recovery Contract

- `NOT_FOUND` calls `onNotFound`; when it does not return `false`, the configured
  fallback handler may run. The active route snapshot is cleared with
  `{ setPrev: null }`.
- Pipeline/render failures call `onNavigationError`.
- If a target view was committed before the failure, `finalizeFailure` returns
  `{ setPrev: failure.to }`; otherwise it leaves `prev` unchanged.

History behavior is derived from `FailedNavigation.error.code` and
`FailedNavigation.commit` by `resolveErrorHistoryPolicy()`.

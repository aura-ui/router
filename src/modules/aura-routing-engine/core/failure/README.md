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
Terminal error recovery lives in `navigation/navigation-failure-handler.ts` and
`NavigationTransactionPipelinePhase.runError()` because they run route `onError`
and attr `error` hooks after a `FailedNavigation` is assembled.

Pre-match `NOT_FOUND` exit cleanup also belongs to lifecycle orchestration via
`runNotFoundExitCleanup`. It is a callback-only legacy path, but it still uses the
same lifecycle context builder as processor-driven phases.

History writes are resolved in `history/` and applied in `navigation/finalize.ts`.
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

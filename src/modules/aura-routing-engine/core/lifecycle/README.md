# Lifecycle Layer

`lifecycle/` owns route lifecycle metadata, context creation, hook binding, hook
policy execution, and NOT_FOUND exit cleanup.

Import from `core/lifecycle` (barrel) — not deep paths — unless you are editing
a file inside this folder.

## Structure

- `phase-registry.ts` — `PHASES`, the source of truth for phase policy, branch
  selection, route callbacks, and route/html hook bindings.
- `bindings/` — resolves registered hook names from route attrs.
- `context/` — `RouteLifecycleContext` builders and runtime context slicing.
- `execution/` — hook policy (`HookPolicyExecutor`) and outcome mapping
  (`guardResultToPhaseOutcome`).
- `logging/` — console boundary for post-commit hook diagnostics.
- `orchestration/` — `runNotFoundExitCleanup`, runtime types.

`types.ts` re-exports `GuardResult` and `RedirectTarget` from `guard.types.ts`.

`NavigationTransactionPipeline` owns navigation order, rendering, transitions, and
the commit gate. It runs route callbacks and delegates registered hooks to
`NavigationTransactionPipelinePhase`.

Terminal navigation failures are handled outside the happy-path phase loop:
`NavigationFailureHandler` assembles `FailedNavigation`, then
`NavigationTransactionPipelinePhase.runError()` runs `PHASES.error` (`onError`
+ attr `error` hooks) via `buildPhaseContext`.

## Phase order vs phase metadata

`PHASES` describes *what* each phase does (branch, hook policy, callbacks).
`NavigationTransactionPipeline` describes *when* phases run (guards → loads →
render → after, plus transition ordering).

`PHASES.error` is defined in the registry but excluded from `PIPELINE_PHASES`.
It runs only on failure via `runError()`, not during a successful navigation.

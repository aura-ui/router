# Lifecycle Layer

`lifecycle/` owns route lifecycle metadata, context creation, hook binding, hook
policy execution, and error-phase orchestration.

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
- `orchestration/` — `ErrorPhaseHandler`, `runNotFoundExitCleanup`, runtime types.

`types.ts` re-exports `GuardResult` and `RedirectTarget` from `guard.types.ts`.

`NavigationTransactionPipeline` owns navigation order, rendering, transitions, and
the commit gate. It runs route callbacks and delegates registered hooks to
`HookPolicyExecutor` via `NavigationTransactionPipelinePhase`.

## Phase order vs phase metadata

`PHASES` describes *what* each phase does (branch, hook policy, callbacks).
`NavigationTransactionPipeline` describes *when* phases run (guards → loads →
render → after, plus transition ordering).

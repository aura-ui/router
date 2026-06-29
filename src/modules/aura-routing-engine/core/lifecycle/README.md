# Lifecycle Layer

`lifecycle/` owns route lifecycle metadata, context creation, hook binding, phase
execution, and lifecycle-specific orchestration.

Import from `core/lifecycle` (barrel) — not deep paths — unless you are editing
a file inside this folder.

## Structure

- `phase-registry.ts` defines `PHASES`, the source of truth for phase policy,
  branch selection, route callbacks, and route/html hook bindings.
- `bindings/` parses route hook attributes and resolves hook names for a route
  phase.
- `context/` exposes pure helpers for `RouteLifecycleContext` and `RouteInfo`
  creation from the current navigation and a minimal cancellable job slice.
- `execution/` runs one route/phase pair: atomic phase step, hook policy, and
  phase outcome mapping.
- `logging/` is the single console boundary for lifecycle diagnostics.
- `orchestration/` runs phases across transition-plan branches and handles the
  terminal `error` phase. `lifecycle-runtime-adapter.ts` bridges processor
  context into lifecycle runtime context.

`types.ts` re-exports `GuardResult` and `RedirectTarget` from `guard.types.ts`
(the shared blocking-hook contract between hooks and lifecycle execution).

`ProcessorPipeline` still owns navigation order, rendering, transitions, and the
commit gate. It delegates lifecycle phase execution to `LifecycleRunner` via
`toLifecycleRuntimeContext()`.

## Phase order vs phase metadata

`PHASES` describes *what* each phase does (branch, hook policy, callbacks).
`ProcessorPipeline` describes *when* phases run (guards → loads → render →
after, plus transition ordering). That split is intentional.

## Hooks-only phases

`reenter` and `left` have no dedicated `<aura-route>` attr (`routeHookProp`).
Register hooks via `hooks="reenter::name"` or `hooks="left::name"`.

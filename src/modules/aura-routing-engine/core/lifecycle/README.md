# Lifecycle Layer

`lifecycle/` owns route lifecycle metadata, context creation, hook binding, phase
execution, and lifecycle-specific orchestration.

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
  terminal `error` phase.

`ProcessorPipeline` still owns navigation order, rendering, transitions, and the
commit gate. It delegates lifecycle phase execution to `LifecycleRunner`.

# Route view layer

How `<aura-route>` turns matched route data into DOM inside `<aura-outlet>`.

## Mental model

| Layer | File | Responsibility |
|-------|------|----------------|
| Element | `aura-route.ts` | Attributes, lifecycle hooks, delegates to controller |
| Orchestration | `view-controller.ts` | **When** to render, signals, cache, errors |
| Outlet adapter | `outlet-adapter.ts` | **Where/how** to mount (replace vs stage, keepAlive skip) |
| DOM slot | `aura-outlet` | `apply`, `commitStage`, `cancelStage` |

One line: **route decides what, controller decides when, adapter decides how, outlet touches DOM.**

## Render flow

```
AuraRoute.render()
  → ViewController.render()
    → resolve content (layout / loader)
    → placeView()
      → mountRoute()          [outlet-adapter]
        → outlet.apply()      [aura-outlet]
```

## Transition flow (out-in / in-out)

When the outlet already has a view and transition policy is `out-in` or `in-out`, the adapter picks `stage` instead of `replace`. Both roots stay in the DOM until the route engine fires `transitionIn`.

```
render (policy: out-in)  →  outlet.apply({ strategy: 'stage' })  →  2 roots in outlet
onTransitionIn()         →  outlet.commitStage()                →  old root removed
cancel / onLeft early    →  outlet.cancelStage()                →  staged root removed
```

## Lifecycle map

| `AuraRoute` hook | `ViewController` | `AuraOutlet` |
|------------------|------------------|--------------|
| `render()` | `render` → `placeView` → `mountRoute` | `apply` |
| `onTransitionIn()` | `onTransitionIn` | `commitStage` |
| `cancelPendingRender()` | `cancelStagedMount` + abort signal | `cancelStage` |
| `onLeft()` | drop staged view if any, `unmountRoute` on leaving view | `cancelStage`, then `destroy` / `detach` |
| `onReenter()` | reattach from `view-cache` | `apply` (replace) |

## Vocabulary

Use different verbs per layer — do not mix `commit` across layers:

| Action | Controller | Adapter | Outlet |
|--------|------------|---------|--------|
| Put view in DOM | `placeView` | `mountRoute` | `apply` |
| Finish transition | `onTransitionIn` | — | `commitStage` |
| Drop staged view | `cancelStagedMount` | — | `cancelStage` |
| Remove view | `onLeft` | `unmountRoute` | `destroy` / `detach` |

## Files

- `view-controller.ts` — stateful orchestration (`activeHandle`, `childOutlet`, render signal)
- `outlet-adapter.ts` — pure functions: strategy resolution, `mountRoute`, `unmountRoute`
- `view-cache.ts` / `view-cache-key.ts` — keep-alive stash between navigations
- `create-view-controller.ts` — wires outlets and content loader into the controller

## Tests

- `test/view/outlet-adapter.test.ts` — adapter + outlet integration (no controller mocks)
- `test/view/view-controller.test.ts` — keep-alive, cache keys, nested layouts
- `test/view/view-flow.test.ts` — end-to-end controller → adapter → outlet (e.g. out-in staging)

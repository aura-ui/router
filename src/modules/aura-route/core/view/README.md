# Route view layer

How `<aura-route>` turns matched route data into DOM inside `<aura-outlet>`.

## Mental model

| Layer | File | Responsibility |
|-------|------|----------------|
| Element | `aura-route.ts` | Attributes, lifecycle hooks, delegates to controller |
| Orchestration | `view-controller.ts` | **When** to render, signals, cache, errors |
| Outlet adapter | `outlet-adapter.ts` | **Where/how** to mount (`replace` vs `stage`) |
| DOM slot | `aura-outlet` | `apply`, `commitStage`, `cancelStage` |

`<aura-router data-transition>` controls **phase order** (`parallel` by default).  
The same attribute is **inherited** by `<aura-route>` and gates **staged mount** (non-empty → crossfade).

## Crossfade flow (SPA default)

```
load → render (stage) → transitionOut ‖ transitionIn → finalizeStage → left
```

## Staging rule

`outlet-adapter.resolveMountStrategy`:

- inherited `data-transition` empty / missing → **`replace`**
- inherited `data-transition` non-empty + outlet occupied → **`stage`**

Per-route override: set `data-transition=""` on `<aura-route>` to force `replace` on that route.

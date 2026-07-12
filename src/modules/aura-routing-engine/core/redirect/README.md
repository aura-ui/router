# redirect

Pre-commit redirect resolution: declarative `redirect` attr hops and blocking hook redirects
(leave / guard / load) before history commit and render.

## Entry points

| Function | Mode | Consumer |
|----------|------|----------|
| `resolveDeclarativeTarget` | sync, hooks skipped | prefetch plan, diagnostics |
| `resolveRedirectChain` | async, blocking hooks | `NavigationCoordinator.navigate` |

Both share the same hop loop and cycle / depth guards. `search` and `hash` from the original
href are preserved on the final leaf; redirect targets are path-only.

## Pipeline

```text
href
  │
  ▼
matchNavigationStep          ← match-hop.ts
  │
  ├─ redirect attr ──► advanceRedirectHop (cycle / depth) ──► next hop
  │
  └─ leaf match ──► onMatched callback
                      │
                      ├─ sync: return MatchedNavigationTarget
                      └─ async: blocking probe (NavigationTransaction.runBlockingProbe)
                              │
                              ├─ redirect ──► next hop
                              ├─ terminal (cancel / error) ──► stop
                              └─ ok ──► resolved target + completedBlockingPhases
```

## Outcome types

**Sync** (`DeclarativeTargetResolve` — `kind` field):

| `kind` | Meaning |
|--------|---------|
| `matched` | Final leaf + active chain |
| `unmatched` | No route for current href |
| `redirect-error` | Cycle or depth exceeded |

**Navigation** (`RedirectResolveResult` — `status` field):

| `status` | Meaning |
|----------|------|
| `resolved` | Final target; may set `replace` when any hop was declarative or hook redirect |
| `unmatched` | No route |
| `redirect-error` | Cycle or depth exceeded |
| `terminal` | Blocking hook short-circuit (cancel / error) with probe transaction |

## Module layout

```text
redirect/
├── index.ts              barrel (public API)
├── types.ts              shared union types
├── match-hop.ts          one URL match hop + resolveRedirectHref
├── hop-loop.ts           hop state, guards, sync/async loop
└── redirect-resolver.ts  resolveDeclarativeTarget, resolveRedirectChain
```

## See also

- [`navigation/`](../navigation) — coordinator and pipeline after redirect resolution
- [`prefetch/`](../prefetch) — uses `resolveDeclarativeTarget` in plan
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — navigation flow diagram

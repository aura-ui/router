# aura-ui-router Roadmap

> **Updated:** 2026-06-30  
> **Legend:** ✓ done · ~ partial · ✗ not started · **→ next** nearest rework  
> **Details:** [docs/todo/](./docs/todo/) · strategy: [docs/ROADMAP_TOP_ROUTER.md](./docs/ROADMAP_TOP_ROUTER.md)

---

## Phase 1 — Engine core

| # | Task                                                                        | Status | Details |
|---|-----------------------------------------------------------------------------|--------|---------|
| **→ 1.1** | Rework engine architecture, Processor + TaskManager + API v2 between layers | ~ | processor ✓; task-manager, unified contract — in progress |
| **→ 1.2** | Rewrite engine layers on API v2 (OOP, perf)                                 | ~ | coordinator, pipeline, route-tree ✓ |
| 1.3 | **EventBus** — `navigation:*`, `load:*`, `node:*`                           | ~ | commit/error callbacks ✓; full stream ✗ |
| 1.4 | Redirect chain collapse (sync chains → single pipeline)                     | ✗ | [REDIRECT_CHAIN_COLLAPSE](./docs/todo/REDIRECT_CHAIN_COLLAPSE.md) |

---

## Phase 2 — Data & cache

| # | Task                                              | Status | Details |
|---|---------------------------------------------------|--------|---------|
| 2.1 | **DataGraph** — fix gaps                          | ~ | [DATAGRAPH_GAPS](./docs/todo/DATAGRAPH_GAPS.md) |
| 2.2 | `out-in-prefetch` — hidden render + strict out-in | ✗ | [OUT_IN_PREFETCH](./docs/todo/OUT_IN_PREFETCH.md) |

---

## Phase 3 — Render & DOM

| #   | Task | Status | Details |
|-----|------|--------|---------|
| 3.1 | **Renderer abstraction** — `renderNode()` in engine | ~ | [RENDERER_ABSTRACTION](./docs/todo/RENDERER_ABSTRACTION.md) |
| 3.2 | Incremental render (patch, not full replace) | ✗ | [INCREMENTAL_RENDER](./docs/todo/INCREMENTAL_RENDER.md) |

---

## Phase 4 — Navigation UX

| # | Task | Status | Details |
|---|------|--------|---------|
| 4.1 | **View Transitions API** at commit point | ✗ | [VIEW_TRANSITIONS_API](./docs/todo/VIEW_TRANSITIONS_API.md) |
| 4.2 | **NavigationObserver** — public pending / state API | ✗ | callbacks internal only |
| 4.3 | DOM events: `navigation-commit`, cancel, redirect | ~ | errors + not-found ✓ |
| 4.4 | Focus management (a11y) after navigation | ✗ | |
| 4.5 | Instant back/forward (branch cache + revalidate) | ✗ | scroll restore ✓ |

---

## Phase 5 — Public API & DX

| # | Task | Status | Details |
|---|------|--------|---------|
| **→ 5.1** | **Route API v3** — `view`, `guard`, `load`, `ready`, `preserve` | ~ | [ROUTE_API_V3](./docs/todo/ROUTE_API_V3.md) |
| **→ 5.2** | Lifecycle naming parity (core-4 + tiers) | ~ | [LIFECYCLE_PHASE_NAMING](./docs/todo/LIFECYCLE_PHASE_NAMING.md) |
| **→ 5.3** | Nested "Route Folders" DX | ✗ | [NESTED_ROUTES_JOY_MODEL](./docs/todo/NESTED_ROUTES_JOY_MODEL.md) |

---

## Phase 6 — Observability & tooling

| # | Task | Status | Details |
|---|------|--------|---------|
| 6.1 | Cache devtools (hit/miss, keys, timeline) | ✗ | [CACHE_DEVTOOLS](./docs/todo/CACHE_DEVTOOLS.md) |
| 6.2 | Navigation timeline (EventBus → dev panel) | ✗ | [EVENT_BUS](./docs/todo/EVENT_BUS.md) |
| 6.3 | Baseline perf metrics (prepare / commit / post) | ✗ | [INCREMENTAL_RENDER — R0 baseline](./docs/todo/INCREMENTAL_RENDER.md) |

---

## Phase 7 — Examples

| # | Task | Status | Details |
|---|------|--------|---------|
| 7.1 | **Demo app** — feature showcase (`src/examples/demo`) | ~ | hooks, loaders, transitions ✓; not exhaustive |
| 7.2 | Minimal starter — flat routes, one hook, one loader | ✗ | copy-paste from README |
| 7.3 | Nested routes + layout outlet | ✗ | sibling swap, inherited guards |
| 7.4 | Auth flow — async guard, redirect, protected layout | ✗ | |
| 7.5 | Prefetch & cache — link hover, `load` SWR, devtools hook | ✗ | depends on Phase 2 |
| 7.6 | Error & not-found recipes | ~ | partial in demo |
| 7.7 | Public playground site (deployed, link from README) | ✗ | |
| 7.8 | E2E suite (Playwright) against examples | ✗ | |

**Done when:** each major feature has a runnable, documented example; playground is one click from README.

---

## Phase 8 — Node.js server integration

| # | Task | Status | Details |
|---|------|--------|---------|
| 8.1 | `ssrFetch` in `ContentLoaderService` | ✗ | stub throws today |
| 8.2 | `isSSR` mode — inject `fetch`, resolve paths on server | ~ | API exists; implementation ✗ |
| 8.3 | **Express** example — server renders `<aura-route>` HTML, client hydrates | ✗ | [SSR story (v0.1 roadmap)](./docs/ROADMAP.md) |
| 8.4 | First paint without client-only fetch (`html-src`, `load` on server) | ✗ | core SSR USP |
| 8.5 | MPA → SPA migration guide (step-by-step) | ✗ | |
| 8.6 | Node adapter API — `createAuraRouterHandler()` or middleware | ✗ | |
| 8.7 | Vite / dev-server integration (SSR entry, HMR) | ✗ | |
| 8.8 | Partial HTML / streaming render (stretch) | ✗ | |

**Done when:** one working Express (or Fastify) app serves routes from Node; browser hydrates without refetch on first paint.

---

## Shipped (baseline)

- NavigationCoordinator + ProcessorPipeline (`guards → loads → render → after`)
- Route tree diff + LCA + `TransitionPlan`
- Fast path (Tier 0) for trivial navigation
- Commit point + staged render
- Prefetch pipeline (link intent, policy cascade)
- DataGraph v1 + `AuraResolvableCache`
- Navigation errors v2 + DOM `not-found` / `navigation-error`
- Scroll restoration
- Demo app (`src/examples/demo`, `index.html`)

---

## Next sprint priorities

The next rework targets **engine core (1.x)** and **public API / DX (5.x)** together: API v2 between layers first, then Route API v3 and lifecycle on HTML.

```text
1. Rework engine architecture — Processor + TaskManager + API v2   → 1.1
2. Rewrite engine layers on API v2 (OOP, perf)                       → 1.2
3. Route API v3 — view, guard, load, ready, preserve                 → 5.1
4. Lifecycle naming parity (core-4 + tiers)                          → 5.2
5. Nested "Route Folders" DX                                         → 5.3
```

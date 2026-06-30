# aura-ui-router Roadmap

> **Updated:** 2026-06-30  
> **For:** library users, contributors, and reviewers — what ships today and what is planned next.  
> **Status:** ✓ done · ~ in progress · ✗ not started · **→ next** current focus  
> **Deep dives:** [docs/todo/](./docs/todo/) · long-term strategy: [docs/ROADMAP_TOP_ROUTER.md](./docs/ROADMAP_TOP_ROUTER.md)

---

## Phase 1 — Routing engine (internal core)

Navigation pipeline: match URL → run guards → load data → render → cleanup.

**Phase goal:** replace ad-hoc layer coupling with a new engine architecture (1.1), then rewrite every module against it (1.2).

| # | Task | Status | Notes |
|---|------|--------|-------|
| **→ 1.1** | **New engine architecture** — Processor, TaskManager, and layer contracts (API v2) | ~ | Foundation work, not a cosmetic refactor: defines how coordinator, pipeline, route tree, prefetch, DataGraph, and other layers talk to each other |
| **→ 1.2** | **Migrate all engine modules** — rewrite every layer on the new architecture | ✗ | Blocked on 1.1: once layer contracts change, each module must be reviewed and migrated (coordinator, pipeline, route tree, prefetch, DataGraph, …) |
| 1.3 | **EventBus** — typed events for navigation, loads, and route tree changes | ~ | Commit/error hooks exist; full event stream not wired yet |

---

## Phase 2 — Data loading & cache

How route `load` hooks run, cache results, and prefetch on link hover.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | **DataGraph** — complete route data layer (cache, SWR, nested reuse) | ~ | [remaining gaps](./docs/todo/DATAGRAPH_GAPS.md) |
| 2.2 | **Out-in prefetch** — preload the next view off-screen, then animate out → in | ✗ | [OUT_IN_PREFETCH](./docs/todo/OUT_IN_PREFETCH.md) |

---

## Phase 3 — View rendering

How the router updates the DOM when a route becomes active.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | **Renderer API** — engine calls `renderNode()` instead of ad-hoc DOM updates | ~ | [RENDERER_ABSTRACTION](./docs/todo/RENDERER_ABSTRACTION.md) — ViewHandle exists; engine hook pending |
| 3.2 | **Incremental DOM updates** — patch changed nodes instead of full `innerHTML` replace | ✗ | [INCREMENTAL_RENDER](./docs/todo/INCREMENTAL_RENDER.md) |

---

## Phase 4 — Navigation experience

What app authors and end users feel during route changes.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | **View Transitions API** — optional cross-fade / slide via `document.startViewTransition` | ✗ | [VIEW_TRANSITIONS_API](./docs/todo/VIEW_TRANSITIONS_API.md) |

---

## Phase 5 — Developer-facing API

HTML attributes and conventions for defining routes without framework glue.

| # | Task | Status | Notes |
|---|------|--------|-------|
| **→ 5.1** | **Route API v3** — `view`, `guard`, `load`, `ready`, `preserve` on `<aura-route>` | ~ | [ROUTE_API_V3](./docs/todo/ROUTE_API_V3.md) |
| **→ 5.2** | **Lifecycle naming** — align hook/phase names with familiar router terminology | ~ | [LIFECYCLE_PHASE_NAMING](./docs/todo/LIFECYCLE_PHASE_NAMING.md) |
| **→ 5.3** | **Nested route folders** — file-system-style nested routes and layouts | ✗ | [NESTED_ROUTES_JOY_MODEL](./docs/todo/NESTED_ROUTES_JOY_MODEL.md) |

---

## Phase 6 — Debugging & performance tooling

Dev-only helpers for contributors and app authors tuning cache and navigation.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | **Cache DevTools** — inspect hits/misses, keys, and eviction in the browser | ✗ | [CACHE_DEVTOOLS](./docs/todo/CACHE_DEVTOOLS.md) |
| 6.2 | **Navigation timeline** — visual prepare → commit → post breakdown in DevTools | ✗ | [EVENT_BUS](./docs/todo/EVENT_BUS.md) |
| 6.3 | **Performance baseline** — measure prepare / commit / post per navigation | ✗ | [INCREMENTAL_RENDER — R0 baseline](./docs/todo/INCREMENTAL_RENDER.md) |

---

## Phase 7 — Examples & docs

Runnable recipes so newcomers can copy patterns instead of reading engine internals.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7.1 | **Demo app** — interactive showcase of hooks, loaders, and transitions | ~ | Lives in `src/examples/demo`; not every feature covered yet |
| 7.2 | **Minimal starter** — smallest app: flat routes, one hook, one loader | ✗ | Target: copy-paste block in README |
| 7.3 | **Nested layouts** — parent layout + child outlet, sibling swaps, inherited guards | ✗ | |
| 7.4 | **Auth recipe** — async guard, redirect to login, protected layout shell | ✗ | |
| 7.5 | **Prefetch & cache recipe** — link hover prefetch, stale-while-revalidate `load` | ✗ | Blocked on Phase 2 data layer |
| 7.6 | **Errors & 404 recipe** — custom error boundaries and not-found pages | ~ | Partially shown in demo |
| 7.7 | **Public playground** — hosted demo linked from README (one-click try) | ✗ | |
| 7.8 | **E2E tests** — Playwright suite against example apps | ✗ | |

**Done when:** every major feature has a small, documented example; the playground is one click from README.

---

## Phase 8 — Server-side rendering (Node.js)

Render `<aura-route>` HTML on the server; hydrate in the browser without a client-only fetch waterfall.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8.1 | **Server fetch** — implement `ssrFetch` in `ContentLoaderService` | ✗ | Stub throws at runtime today |
| 8.2 | **SSR mode** — pass Node `fetch`, resolve asset paths on the server | ~ | Config surface exists; runtime path not complete |
| 8.3 | **Express example** — server renders route HTML, client hydrates | ✗ | [SSR story (v0.1 roadmap)](./docs/ROADMAP.md) |
| 8.4 | **SSR first paint** — ship HTML + data from server (`html-src`, `load` on Node) | ✗ | Primary SSR differentiator for this library |
| 8.5 | **MPA → SPA migration guide** — step-by-step for existing multi-page sites | ✗ | |
| 8.6 | **Node adapter** — `createAuraRouterHandler()` or Express/Fastify middleware | ✗ | |
| 8.7 | **Vite integration** — SSR entry point and HMR for route modules | ✗ | |
| 8.8 | **Streaming SSR** — partial HTML / streamed response (stretch) | ✗ | |

**Done when:** one Express (or Fastify) example serves routes from Node and the browser hydrates without refetch on first paint.

---

## Already shipped

Baseline you can use today (see demo in `src/examples/demo` and `index.html`):

- **Navigation pipeline** — guards → loads → render → after hooks in order
- **Route tree diff** — only changed branches re-render; shared parent layouts stay mounted
- **Fast path** — skip heavy work on simple link clicks with no guards or loaders
- **Commit point** — staged render: prepare off-screen, swap when ready
- **Link prefetch** — hover/tap intent with inherited prefetch policy
- **DataGraph v1** — route `load` orchestration + `AuraResolvableCache`
- **Navigation errors** — structured errors + `navigation-error` / `not-found` DOM events
- **Scroll restoration** — restore scroll position on back/forward

---

## Current focus

New engine architecture (**1.x**) and public route API (**5.x**) are sequential: first define Processor + TaskManager + layer contracts (1.1), then rewrite every engine module on top (1.2), then ship Route API v3 and lifecycle attrs on `<aura-route>` (5.x).

```text
1. New engine architecture — Processor + TaskManager + layer contracts  → 1.1
2. Rewrite all engine modules on the new architecture                     → 1.2
3. Route API v3 — view, guard, load, ready, preserve                    → 5.1
4. Lifecycle naming aligned with common routers                         → 5.2
5. Nested route folders DX                                              → 5.3
```

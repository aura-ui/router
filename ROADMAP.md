# Aura UI Router — Roadmap

**Declarative routing for Web Components — what's in the codebase today and what comes next.**

| | |
| --- | --- |
| **Updated** | 2026-06-30 |
| **Audience** | Library users, contributors, and reviewers |
| **Deep dives** | [docs/todo/](./docs/todo/) — design notes per feature |

---

## Legend

| Symbol | Meaning |
| --- | --- |
| ✓ | **Done** — implemented in the codebase |
| ~ | **In progress** — partially implemented |
| ✗ | **Planned** — not started |
| **→** | **Current focus** — active work right now |

---

## Table of contents

- [Current focus](#current-focus)
- [Available today](#available-today)
- [Phase overview](#phase-overview)
- [Phase 1 — Routing engine](#phase-1--routing-engine-internal-core)
- [Phase 2 — Data loading & cache](#phase-2--data-loading--cache)
- [Phase 3 — View rendering](#phase-3--view-rendering)
- [Phase 4 — Navigation experience](#phase-4--navigation-experience)
- [Phase 5 — Developer-facing API](#phase-5--developer-facing-api)
- [Phase 6 — Debugging & performance](#phase-6--debugging--performance-tooling)
- [Phase 7 — Examples & docs](#phase-7--examples--docs)
- [Phase 8 — MPA → SPA](#phase-8--mpa--spa)

---

## Current focus

New engine architecture (**Phase 1**) and the declarative route API (**Phase 5**) are sequential: first define layer contracts, then migrate every module, then ship the target `<aura-route>` API from [README](./README.md).

```text
1.1  New engine architecture     Processor + TaskManager + layer contracts
  ↓
1.2  Migrate all engine modules  Rewrite coordinator, pipeline, route tree, prefetch, DataGraph, …
  ↓
5.1  Target route API              view, guard, load, ready, preserve on <aura-route>
5.2  Lifecycle naming            Align hook/phase names with familiar router terminology
5.3  Nested route folders        File-system-style nested routes and layouts
```

---

## Available today

Baseline in the repo (pre-release) — try the [demo app](./src/examples/demo) or open [`index.html`](./index.html) locally.

| Feature | What it does |
| --- | --- |
| **Navigation pipeline** | Guards → loads → render → after hooks, in order |
| **Route tree diff** | Only changed branches re-render; shared parent layouts stay mounted |
| **Fast path** | Skip heavy work on simple link clicks with no guards or loaders |
| **Commit point** | Staged render: prepare off-screen, swap when ready |
| **Link prefetch** | Hover/tap intent with inherited prefetch policy |
| **DataGraph** | Route `load` orchestration + `AuraResolvableCache` (baseline; see Phase 2.1) |
| **Navigation errors** | Structured errors + `navigation-error` / `not-found` DOM events |
| **Scroll restoration** | Restore scroll position on back/forward |

---

## Phase overview

| Phase | Theme | Lead items | Overall |
| --- | --- | --- | --- |
| **1** | [Routing engine](#phase-1--routing-engine-internal-core) | 1.1 architecture, 1.2 migration | ~ |
| **2** | [Data & cache](#phase-2--data-loading--cache) | DataGraph, out-in prefetch | ~ |
| **3** | [View rendering](#phase-3--view-rendering) | Renderer API, incremental DOM | ~ |
| **4** | [Navigation UX](#phase-4--navigation-experience) | View Transitions API | ✗ |
| **5** | [Developer API](#phase-5--developer-facing-api) | Target route API, lifecycle, nested folders | ~ |
| **6** | [DevTools](#phase-6--debugging--performance-tooling) | Cache inspector, nav timeline | ✗ |
| **7** | [Examples & docs](#phase-7--examples--docs) | Demo, recipes, playground, E2E | ~ |
| **8** | [MPA → SPA](#phase-8--mpa--spa) | Migration guide, client hydration, static example | ✗ |

---

## Phase 1 — Routing engine (internal core)

> **Goal:** Replace ad-hoc layer coupling with a new engine architecture (1.1), then rewrite every module against it (1.2).
>
> **Pipeline:** match URL → run guards → load data → render → cleanup.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| **→ 1.1** | **New engine architecture** — Processor, TaskManager, and layer contracts | ~ | Foundation work, not a cosmetic refactor: defines how coordinator, pipeline, route tree, prefetch, DataGraph, and other layers talk to each other |
| **→ 1.2** | **Migrate all engine modules** — rewrite every layer on the new architecture | ✗ | Blocked on 1.1: once layer contracts change, each module must be reviewed and migrated |
| 1.3 | **EventBus** — typed events for navigation, loads, and route tree changes | ~ | Commit/error hooks exist; full event stream not wired yet · [Event bus](./docs/todo/EVENT_BUS.md) |

---

## Phase 2 — Data loading & cache

> **Goal:** Run route `load` hooks, cache results, and prefetch on link hover.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 2.1 | **DataGraph** — complete route data layer (cache, SWR, nested reuse) | ~ | [Remaining gaps](./docs/todo/DATAGRAPH_GAPS.md) |
| 2.2 | **Out-in prefetch** — preload the next view off-screen, then animate out → in | ✗ | [Out-in prefetch](./docs/todo/OUT_IN_PREFETCH.md) |

---

## Phase 3 — View rendering

> **Goal:** Update the DOM predictably when a route becomes active.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 3.1 | **Renderer API** — engine calls `renderNode()` instead of ad-hoc DOM updates | ~ | [Renderer abstraction](./docs/todo/RENDERER_ABSTRACTION.md) — ViewHandle exists; engine hook pending |
| 3.2 | **Incremental DOM updates** — patch changed nodes instead of full `innerHTML` replace | ✗ | [Incremental render](./docs/todo/INCREMENTAL_RENDER.md) |

---

## Phase 4 — Navigation experience

> **Goal:** What app authors and end users feel during route changes.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 4.1 | **View Transitions API** — optional cross-fade / slide via `document.startViewTransition` | ✗ | [View Transitions API](./docs/todo/VIEW_TRANSITIONS_API.md) |

---

## Phase 5 — Developer-facing API

> **Goal:** HTML attributes and conventions for defining routes without framework glue.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| **→ 5.1** | **Target route API** — `view`, `guard`, `load`, `ready`, `preserve` on `<aura-route>` | ~ | As documented in [README](./README.md) · [design notes](./docs/todo/ROUTE_API_V3.md) |
| **→ 5.2** | **Lifecycle naming** — align hook/phase names with familiar router terminology | ~ | [Lifecycle naming](./docs/todo/LIFECYCLE_PHASE_NAMING.md) |
| **→ 5.3** | **Nested route folders** — file-system-style nested routes and layouts | ✗ | [Nested route folders](./docs/todo/NESTED_ROUTES_JOY_MODEL.md) |

---

## Phase 6 — Debugging & performance tooling

> **Goal:** Dev-only helpers for contributors and app authors tuning cache and navigation.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 6.1 | **Cache DevTools** — inspect hits/misses, keys, and eviction in the browser | ✗ | [Cache DevTools](./docs/todo/CACHE_DEVTOOLS.md) |
| 6.2 | **Navigation timeline** — visual prepare → commit → post breakdown in DevTools | ✗ | [Event bus](./docs/todo/EVENT_BUS.md) |
| 6.3 | **Performance baseline** — measure prepare / commit / post per navigation | ✗ | [Incremental render — R0 baseline](./docs/todo/INCREMENTAL_RENDER.md) |

---

## Phase 7 — Examples & docs

> **Goal:** Runnable recipes so newcomers can copy patterns instead of reading engine internals.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 7.1 | **Demo app** — interactive showcase of hooks, loaders, and transitions | ~ | Lives in [`src/examples/demo`](./src/examples/demo); not every feature covered yet |
| 7.2 | **Minimal starter** — smallest app: flat routes, one hook, one loader | ✗ | Target: copy-paste block in README |
| 7.3 | **Nested layouts** — parent layout + child outlet, sibling swaps, inherited guards | ✗ | |
| 7.4 | **Auth recipe** — async guard, redirect to login, protected layout shell | ✗ | |
| 7.5 | **Prefetch & cache recipe** — link hover prefetch, stale-while-revalidate `load` | ✗ | Blocked on Phase 2 data layer |
| 7.6 | **Errors & 404 recipe** — custom error boundaries and not-found pages | ~ | Partially shown in demo |
| 7.7 | **Public playground** — hosted demo linked from README (one-click try) | ✗ | |
| 7.8 | **E2E tests** — Playwright suite against example apps | ✗ | |

> **Done when:** every major feature has a small, documented example; the playground is one click from README.

---

## Phase 8 — MPA → SPA

> **Goal:** Server keeps serving ready-made HTML (as today). Inject `<aura-router>` via layout or template. Client upgrades in-app links to SPA navigation — **no Aura runtime on the server**.
>
> Background: [SSR & MPA strategy](./docs/todo/SSR_MPA_STRATEGY.md) — when client hydration is enough; Node SSR runtime is **not** on the public roadmap (exploratory notes stay in todo only).

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 8.1 | **MPA → SPA migration guide** — step-by-step for existing multi-page sites | ✗ | Default adoption path; server unchanged |
| 8.2 | **Shared layout pattern** — inject `<aura-router>` + routes from CMS/template (EJS, PHP, static partial) | ✗ | Routes in HTML; server does not run Aura pipeline |
| 8.3 | **Client hydration recipe** — full HTML from server + `AuraRouter.install()` without refetch on first paint | ✗ | First visit = server HTML; subsequent nav = client pipeline |
| 8.4 | **Static MPA example** — nginx or Express static: one `.html` per URL + client bundle | ✗ | Fastest path; no Node adapter |

> **Done when:** guide + example show server serving `.html` directly and Aura handling navigation only in the browser.

# Aura Router — Roadmap

**Declarative routing for Web Components — what's shipped, what's next.**

| | |
| --- | --- |
| **Version** | `0.0.1` |
| **Updated** | 2026-07-24 |
| **Audience** | Library users, contributors, and reviewers |
| **Public docs** | [README](./README.md) · [Guide](./docs/guide.md) · [LIMITATIONS](./LIMITATIONS.md) · [CHANGELOG](./CHANGELOG.md) |

---

## Legend

| Symbol | Meaning |
| --- | --- |
| <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | **Done** — implemented in the codebase |
| <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | **In progress** — partially implemented |
| <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | **Planned** — not started |
| <span style="background:#2563eb;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">→</span> | **Current focus** — active work right now |

**How this doc is structured:** open work stays detailed. Fully closed phases are summarized under [Shipped](#shipped) (not deleted — they show maturity). Inside a mixed phase, done rows stay next to open ones so progress is visible without a second file.

---

## Table of contents

- [Current focus](#current-focus)
- [Available today](#available-today)
- [Phase overview](#phase-overview)
- [Shipped](#shipped)
- [Phase 2 — Data loading & cache](#phase-2--data-loading--cache)
- [Phase 3 — View rendering](#phase-3--view-rendering)
- [Phase 4 — Navigation experience](#phase-4--navigation-experience)
- [Phase 5 — Developer-facing API](#phase-5--developer-facing-api)
- [Phase 6 — Debugging & performance](#phase-6--debugging--performance-tooling)
- [Phase 7 — Examples & docs](#phase-7--examples--docs)
- [Phase 8 — MPA → SPA](#phase-8--mpa--spa)

---

## Current focus

| | Item | What |
| :---: | --- | --- |
| <span style="background:#2563eb;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">→</span> | **8.3** Client hydration recipe | full HTML from server + `AuraRouter.install()` without refetch on first paint |
| <span style="background:#2563eb;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">→</span> | **7.x** Adoption artifacts | recipes, Playwright E2E, hosted playground |
| <span style="background:#64748b;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">·</span> | Pre-release **0.0.1** | merge → `main`, npm publish |
| <span style="background:#64748b;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">·</span> | **6.x** Debugging & performance | Cache DevTools, nav timeline UI, per-nav metrics gate |

---

## Available today

Pre-release baseline — [demo](./src/examples/demo) via `npm run dev`, or [`index.html`](./index.html).

Today’s sole package entry (`@auraui/router`) ships the **full** surface (loaders + data). That remains the default — see [5.4](#phase-5--developer-facing-api) for a possible future `@auraui/router/min`.

| Feature | What it does |
| --- | --- |
| **Navigation pipeline** | Guards → loads → render → after hooks (`NavigationCoordinator` → transaction → pipeline) |
| **Route tree diff** | Only changed branches re-render; shared parent layouts stay mounted |
| **Nested routes + outlet** | Parent layouts, sibling swaps, scoped `path="*"`, `<aura-outlet>` (root outlet auto-created if missing) |
| **Fast path** | Skip heavy work on simple link clicks with no guards or loaders |
| **Commit point** | Staged render: prepare off-screen, swap when ready |
| **Link prefetch** | Hover/tap intent on `[aura-router-link]` with inherited prefetch policy |
| **Named hooks** | `AuraRouter.use(name, fn)` / `defineRouteHook(name, fn)` for lifecycle & transitions |
| **Loading chrome** | `loading-template` / `loading-body-class` / loading events during prepare |
| **DataGraph** | Route `load` + `AuraResolvableSwrCache` (per-entry `gcTime`/`staleTime`; parity gaps in 2.1) |
| **View loaders** | `view="…"` — `url`, `html`, `template`, `import`, `component`, `iframe` (+ hardened `extract`) |
| **Lifecycle attrs** | `guard`, `load`, `ready`, `leave`, … on `<aura-route>`; most inherit from router / parent — **`load` is local only** |
| **View cache** | `cache` ladder **off → `cache` → `dom` → `all`** (plus `view` / `data`) |
| **Invalidate** | `router.invalidate({ cache: 'data' \| 'view' \| 'all' })` |
| **Events** | DOM events on `<aura-router>` (`navigation-error`, `not-found`, …); engine `EventBus` is internal |
| **Navigation errors** | Structured failures + `error-template` / catch-all `path="*"` |
| **Scroll restoration** | Restore scroll position on back/forward |
| **URLPattern matcher** | Native-style path matching with params |

---

## Phase overview

| Phase | Theme | Overall | Notes |
| --- | --- | :---: | --- |
| **1** | [Routing engine](#shipped) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Shipped — see summary below |
| **2** | [Data & cache](#phase-2--data-loading--cache) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Cache ladder / invalidate / entry timings <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span>; DataGraph parity + out-in prefetch open |
| **3** | [View rendering](#phase-3--view-rendering) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Renderer API, incremental DOM |
| **4** | [Navigation UX](#phase-4--navigation-experience) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Loading chrome <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span>; View Transitions API <span style="background:#dc2626;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✗</span> |
| **5** | [Developer API](#phase-5--developer-facing-api) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Route API + named hooks <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span>; folders <span style="background:#f59e0b;color:#111;padding:1px 6px;border-radius:3px;font-weight:700">~</span>; optional `/min` later <span style="background:#dc2626;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✗</span> |
| **6** | [DevTools](#phase-6--debugging--performance-tooling) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Event stream + smoke/size CI <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span>; DevTools UI / per-nav gate open |
| **7** | [Examples & docs](#phase-7--examples--docs) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Demo + local playground <span style="background:#f59e0b;color:#111;padding:1px 6px;border-radius:3px;font-weight:700">~</span>; recipes / E2E / hosted playground open |
| **8** | [MPA → SPA](#phase-8--mpa--spa) | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Guide + static example |

---

## Shipped

Closed work kept here in short form. User-facing notes of the same work: [CHANGELOG](./CHANGELOG.md) (`[0.0.1]`).

### Phase 1 — Routing engine <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span>

Orchestration: `NavigationCoordinator` → `NavigationTransaction` → `NavigationTransactionPipeline`. Modules under `src/modules/aura-routing-engine/core/` (route-tree, prefetch, DataGraph, view-mount, …). Typed engine `EventBus` + `NavigationPulse` (internal; host maps to DOM events). Layer map: [`core/ARCHITECTURE.md`](./src/modules/aura-routing-engine/core/ARCHITECTURE.md).

| # | Task | Status |
| ---: | --- | :---: |
| 1.1 | Engine architecture (layer contracts + orchestration) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 1.2 | Migrate engine modules onto that architecture | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 1.3 | Typed EventBus (engine-internal; DOM events on host) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |

### Also shipped (inside later phases)

| # | Task | Status |
| ---: | --- | :---: |
| 2.x | Cache ladder + per-entry `gcTime`/`staleTime` + unified `invalidate({ cache })` | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 4.x | Loading chrome (`loading-template` / body class / events) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 5.1 | Target route API — `view`, `guard`, `load`, `ready`, `cache` | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 5.2 | Lifecycle naming (`guard` / `load` / `ready` / …) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 5.x | Named hooks — `AuraRouter.use` / `defineRouteHook`; `aura-router-link`; `error-template`; auto root outlet | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |

---

## Phase 2 — Data loading & cache

> **Goal:** Run route `load` hooks, cache results, and prefetch on link hover.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 2.1 | **DataGraph** — complete route data layer (cache, SWR, nested reuse) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | v1 shipped (parallel loads, LCA reuse, unified invalidate, per-entry `gcTime`/`staleTime`, `cache` ladder). Gaps: `shouldRevalidate`, public `defer()`, nav-time SWR |
| 2.2 | **Out-in prefetch** — preload the next view off-screen, then animate out → in | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | `transition-order="out-in"` exists; dedicated out-in-prefetch policy does not |

---

## Phase 3 — View rendering

> **Goal:** Update the DOM predictably when a route becomes active.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 3.1 | **Renderer API** — engine calls `renderNode()` instead of ad-hoc DOM updates | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | `ViewHandle` + outlet/view controllers exist; engine `renderNode()` hook pending |
| 3.2 | **Incremental DOM updates** — patch changed nodes instead of full `innerHTML` replace | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Full replace path today; morph/diff renderer not started |

---

## Phase 4 — Navigation experience

> **Goal:** What app authors and end users feel during route changes.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 4.0 | **Loading chrome** — skeleton / body class / events while prepare runs | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | `loading-template` skipped when page transitions are defined; listed under [Shipped](#shipped) |
| 4.1 | **View Transitions API** — optional cross-fade / slide via `document.startViewTransition` | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | CSS / WAAPI transitions via attrs work in demo; browser VT API not wired in engine |

---

## Phase 5 — Developer-facing API

> **Goal:** HTML attributes and package entries for defining routes without framework glue.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 5.1 | **Target route API** — `view`, `guard`, `load`, `ready`, `cache` on `<aura-route>` | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | See [docs/guide.md](./docs/guide.md); `cache` ladder + `error-template` / `aura-router-link`; listed under [Shipped](#shipped) |
| 5.2 | **Lifecycle naming** — align hook/phase names with familiar router terminology | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Listed again under [Shipped](#shipped) |
| 5.2a | **Named hook registration** — `AuraRouter.use(name, fn)` / `defineRouteHook(name, fn)` | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Listed under [Shipped](#shipped) |
| 5.3 | **Nested route folders** — file-system-style nested routes and layouts | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Engine nested path + demo layouts <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span>; colocated folder templates still open |
| 5.4 | **Default vs `/min` entry** — one package, optional slim import | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | **Default stays full:** `@auraui/router` always ships the full surface. **Later (optional):** `@auraui/router/min` — minimal working core, with plugins to opt into loaders / DataGraph / other pieces as needed |

---

## Phase 6 — Debugging & performance tooling

> **Goal:** Dev-only helpers for contributors and app authors tuning cache and navigation.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 6.1 | **Cache DevTools** — inspect hits/misses, keys, and eviction in the browser | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | No hit/miss UI yet |
| 6.2 | **Navigation timeline** — visual prepare → commit → post breakdown in DevTools | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Event stream <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span> (engine `EventBus` / `NavigationPulse` → host DOM events); DevTools timeline UI not built |
| 6.3 | **Performance baseline** — measure prepare / commit / post per navigation | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | `bench/` + `npm run bench*` exist; CI smoke + size checks <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span>; per-nav metrics gate still open |

---

## Phase 7 — Examples & docs

> **Goal:** Runnable recipes so newcomers can copy patterns instead of reading engine internals.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 7.1 | **Demo app** — interactive showcase of hooks, loaders, and transitions | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | [`src/examples/demo`](./src/examples/demo); named hooks + loading chrome covered partially; not every feature yet |
| 7.2 | **Minimal starter** — smallest app: flat routes, one hook, one loader | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | README Quick start covers it; no separate `examples/minimal/` package |
| 7.3 | **Nested layouts** — parent layout + child outlet, sibling swaps, inherited guards | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Shown in demo (`routing-nested` / `routing-advanced`); not a standalone recipe |
| 7.4 | **Auth recipe** — async guard, redirect to login, protected layout shell | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | |
| 7.5 | **Prefetch & cache recipe** — link hover prefetch, stale-while-revalidate `load` | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Prefetch + `cache` ladder + per-entry timings <span style="background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700">✓</span>; dedicated recipe + SWR parity still open (Phase 2.1) |
| 7.6 | **Errors & 404 recipe** — custom error boundaries and not-found pages | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | `error-template` + catch-all in demo; dedicated recipe still open |
| 7.7 | **Public playground** — hosted demo linked from README (one-click try) | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Local [`demo-space/`](./demo-space) linked from README (scratch); Fastify [`playground/`](./playground/) exists; not hosted |
| 7.8 | **E2E tests** — Playwright suite against example apps | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | No Playwright config yet |
| 7.9 | **Pre-release 0.0.1** — merge to `main`, npm publish | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Build/tests/pack + CI smoke/size green; merge + publish pending |

> **Done when:** every major feature has a small, documented example; the playground is one click from README.

---

## Phase 8 — MPA → SPA

> **Goal:** Server keeps serving ready-made HTML (as today). Inject `<aura-router>` via layout or template. Client upgrades in-app links to SPA navigation — **no Aura runtime on the server**.
>
> Client hydration is enough for the default path; a Node SSR runtime is **not** on the public roadmap.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 8.1 | **MPA → SPA migration guide** — step-by-step for existing multi-page sites | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Default adoption path; server unchanged |
| 8.2 | **Shared layout pattern** — inject `<aura-router>` + routes from CMS/template (EJS, PHP, static partial) | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Routes in HTML; server does not run Aura pipeline |
| <span style="background:#2563eb;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">→</span> **8.3** | **Client hydration recipe** — full HTML from server + `AuraRouter.install()` without refetch on first paint | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Patterns in [docs/guide.md](./docs/guide.md) (`url` + `extract` + `aura-router-link`); dedicated first-paint recipe still missing |
| 8.4 | **Static MPA example** — nginx or Express static: one `.html` per URL + client bundle | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Fastest path; no Node adapter |

> **Done when:** guide + example show server serving `.html` directly and Aura handling navigation only in the browser.

# Aura Router — Roadmap

**Declarative routing for Web Components — what's shipped, what's next.**

| | |
| --- | --- |
| **Version** | `0.1.0` |
| **Updated** | 2026-08-11 |
| **Audience** | Library users, contributors, and reviewers |
| **Public docs** | [README](./README.md) · [Guide](./docs/guide.md) · [LIMITATIONS](./LIMITATIONS.md) · [SECURITY](./SECURITY.md) · [CHANGELOG](./CHANGELOG.md) |

---

## Legend

| Symbol | Meaning |
| --- | --- |
| <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | **Done** — implemented in the library or its linked official example |
| <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | **In progress** — usable parts exist, but a stated completion step remains |
| <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | **Planned** — no usable implementation yet |
| <span style="background:#2563eb;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">→</span> | **Current focus** — active work right now |

**How to read this document:** [Implemented now](#implemented-now) shows what already works. [Current focus](#current-focus) lists the immediate priorities. The phase tables keep completed and open work together so each status is visible in context.

---

## Table of contents

- [Current focus](#current-focus)
- [Implemented now](#implemented-now)
- [Phase overview](#phase-overview)
- [Phase 1 — Routing engine](#phase-1--routing-engine)
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
| <span style="background:#2563eb;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">→</span> | **8.1** Migration guide | consolidate the first-paint guide, recipe, article, and `router-preview` walkthrough into one canonical migration document |
| <span style="background:#2563eb;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">→</span> | **7.7** Hosted demo | deploy [`aura-ui/router-preview`](https://github.com/aura-ui/router-preview) and add a live URL to the README |
| <span style="background:#2563eb;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">→</span> | **7.10** E2E in CI | run the existing `router-preview` Playwright suite in automated CI |

---

## Implemented now

The current codebase includes the features below. Run the local showcase with `npm run dev`; the MPA→SPA reference is [`playground/`](./playground/). The standalone static demo and its Playwright suite live in [`aura-ui/router-preview`](https://github.com/aura-ui/router-preview).

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
| **Loading UI** | Body class and events during prepare; experimental `loading-template` skeleton |
| **DataGraph** | Route `load` + `AuraResolvableSwrCache` (per-entry `gcTime`/`staleTime`; parity gaps in 2.1) |
| **View loaders** | `view="…"` — `url`, `html`, `template`, `import`, `component`, `iframe` (+ hardened `extract`) |
| **Lifecycle attrs** | `guard`, `load`, `ready`, `leave`, … on `<aura-route>`; most inherit from router / parent — **`load` is local only** |
| **View cache** | `cache` ladder **off → `cache` → `dom` → `all`** (plus `view` / `data`) |
| **Invalidate** | `router.invalidate({ cache: 'data' \| 'view' \| 'all' })` |
| **Events** | DOM events on `<aura-router>` (`navigation-error`, `not-found`, …); engine `EventBus` is internal |
| **Navigation errors** | Structured failures + `error-template` / catch-all `path="*"` |
| **Scroll restoration** | Restore scroll position on back/forward |
| **URLPattern matcher** | Native-style path matching with params |
| **First-paint hydrate** | Flat adopt via `extract`; nested shell via `aura-router-ssr` + outlet tree; no refetch on boot; index-folder slash fix — [guide](./docs/guide.md#first-paint-mpa--spa) |
| **Hook DX** | Typed `RouteLoadFn<TData>` and optional cancellation `reason` propagated to `navigation-cancel` |
| **Recipes** | Auth, nested layouts, prefetch/cache, 404, and first paint under [`docs/recipes/`](./docs/recipes/) |
| **Static MPA example** | One HTML document per URL, no-JS fallback, nested adoption, and Playwright E2E in [`router-preview`](https://github.com/aura-ui/router-preview) |

---

## Phase overview

| Phase | Theme | Overall | Notes |
| --- | --- | :---: | --- |
| **1** | [Routing engine](#phase-1--routing-engine) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Core architecture, orchestration, and typed internal events are complete |
| **2** | [Data & cache](#phase-2--data-loading--cache) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Core loading, cache ladder, invalidation, and `ctx.parent()` are done; navigation-time SWR and out-in prefetch remain |
| **3** | [View rendering](#phase-3--view-rendering) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | View handles and outlet controllers exist; a unified renderer contract and incremental DOM remain |
| **4** | [Navigation UX](#phase-4--navigation-experience) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Loading classes/events are done; browser View Transitions and Navigation API transport remain |
| **5** | [Developer API](#phase-5--developer-facing-api) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Route API, nested structure, named hooks, typed loads, and cancellation reasons are done; basename, typed/optional path params, hook `cause`, structured targets, and optional `/min` remain |
| **6** | [DevTools](#phase-6--debugging--performance-tooling) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Internal phase events, benchmarks, smoke, and size CI exist; DevTools UI and per-navigation metrics remain |
| **7** | [Examples & docs](#phase-7--examples--docs) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Five recipes and Playwright E2E are done; a live hosted demo, CI E2E, and complete feature showcase remain |
| **8** | [MPA → SPA](#phase-8--mpa--spa) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Hydration, shared layouts, and the static MPA example are done; the canonical migration guide remains |

---

## Phase 1 — Routing engine

Orchestration: `NavigationCoordinator` → `NavigationTransaction` → `NavigationTransactionPipeline`. Modules under `src/modules/aura-routing-engine/core/` (route-tree, prefetch, DataGraph, view-mount, …). Typed engine `EventBus` + `NavigationPulse` (internal; host maps to DOM events). Layer map: [`core/ARCHITECTURE.md`](./src/modules/aura-routing-engine/core/ARCHITECTURE.md).

| # | Task | Status |
| ---: | --- | :---: |
| 1.1 | Engine architecture (layer contracts + orchestration) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 1.2 | Migrate engine modules onto that architecture | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |
| 1.3 | Typed EventBus (engine-internal; DOM events on host) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> |

---

## Phase 2 — Data loading & cache

> **Goal:** Run route `load` hooks, cache results, and prefetch on link hover.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 2.1 | **DataGraph** — complete route data layer (cache, SWR, nested reuse) | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Done: parallel loads, nested reuse, `ctx.parent()`, unified invalidation, entry timings, cache ladder. Remaining: navigation-time SWR, `shouldRevalidate`, public `defer()`, optional query ignore-list |
| 2.2 | **Out-in prefetch** — preload the next view off-screen, then animate out → in | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Generic intent/tap prefetch and `transition-order="out-in"` exist, but prefetch does not prepare an off-screen DOM branch |

---

## Phase 3 — View rendering

> **Goal:** Update the DOM predictably when a route becomes active.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 3.1 | **Renderer API** — engine calls `renderNode()` instead of ad-hoc DOM updates | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | `ViewHandle`, outlet strategies, and view controllers exist; one engine-level `renderNode()` contract remains |
| 3.2 | **Incremental DOM updates** — patch changed nodes instead of full `innerHTML` replace | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Full replace path today; morph/diff renderer not started |

---

## Phase 4 — Navigation experience

> **Goal:** What app authors and end users feel during route changes.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 4.0 | **Loading UI** — body class / events while prepare runs | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Body class and events are the preferred path. `loading-template` exists but is experimental and may be removed |
| 4.1 | **View Transitions API** — optional cross-fade / slide via `document.startViewTransition` | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | CSS / WAAPI transitions via attrs work in demo; browser VT API not wired in engine |
| 4.2 | **Navigation API transport** — prefer `window.navigation` (`navigate` + `intercept`); keep History API fallback | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | The provider interface and History API implementation exist. A `window.navigation` provider is not implemented |

---

## Phase 5 — Developer-facing API

> **Goal:** HTML attributes and package entries for defining routes without framework glue.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 5.1 | **Target route API** — `view`, `guard`, `load`, `ready`, `cache` on `<aura-route>` | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Documented in the [guide](./docs/guide.md), including cache, errors, and router links |
| 5.2 | **Lifecycle naming** — align hook/phase names with familiar router terminology | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Public phases and their order are documented and tested |
| 5.2a | **Named hook registration** — `AuraRouter.use(name, fn)` / `defineRouteHook(name, fn)` | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Shared registration, options, version checks, and removal are implemented |
| 5.3a | **Nested route structure** — nested paths, layouts, and path-only parents | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Implemented in the engine, guide, demo, playground, and nested recipe |
| 5.3b | **Colocated folder convention** — optional file/template convention for route folders | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | No build-time file-system convention or automatic colocated-template wiring |
| 5.4 | **Default vs `/min` entry** — one package, optional slim import | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | **Default stays full:** `@auraui/router` always ships the full surface. **Later (optional):** `@auraui/router/min` — minimal working core, with plugins to opt into loaders / DataGraph / other pieces as needed |
| 5.5 | **Basename / subfolder mode** — mount app under `/app`, GitHub Pages, multi-SPA on one host | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Attr/config on `<aura-router>`; strip/join for match + links + `navigate` |
| 5.6a | **Typed path params** — e.g. `:userId(int)`, `:slug(slug)` in `path` | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Inline in `path` (not a separate `params` attr). Small builtin set; fail match on type mismatch. Avoid `:id&lt;int&gt;` in HTML attrs |
| 5.6b | **Optional path params** — e.g. `:section?` and typed `:page(int)?` | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | `URLPattern` already matches the basic optional syntax and omitted values stay out of `params`. Public support still needs route-priority rules, conflict tests, and documentation |
| 5.7 | **Hook `cause` on `RouteLifecycleContext`** — expose why a hook runs (`enter` / `prefetch` / `stay`) | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | So `load` / `ready` can skip analytics or DOM side effects on speculative prefetch vs real navigation / same-leaf update |
| 5.8 | **Structured navigation target** — object overload for `navigate({ pathname, query, hash }, options?)` | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Keep the string overload; serialize query values consistently and preserve `replace` / `syncHistory` options |
| 5.9 | **Hook DX** — typed load results and cancellation metadata | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | `RouteLoadFn<TData>` is public; `{ type: 'cancel', reason? }` propagates its reason to `navigation-cancel` |

---

## Phase 6 — Debugging & performance tooling

> **Goal:** Dev-only helpers for contributors and app authors tuning cache and navigation.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 6.1 | **Cache DevTools** — inspect hits/misses, keys, and eviction in the browser | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | No hit/miss UI yet |
| 6.2 | **Navigation timeline** — visual prepare → commit → post breakdown in DevTools | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Full phase stream exists on internal `EventBus` / `NavigationPulse`; public DOM events expose a subset. Timeline UI remains |
| 6.3 | **Performance baseline** — measure prepare / commit / post per navigation | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Local microbenchmarks and CI smoke/size checks exist. Benchmarks are not run in CI; no per-navigation metrics API or gate yet |

---

## Phase 7 — Examples & docs

> **Goal:** Runnable recipes so newcomers can copy patterns instead of reading engine internals.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| 7.1 | **Demo app** — interactive showcase of hooks, loaders, and transitions | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Root `index.html` + `public/features/` cover routing, hydration, updates, and transitions; auth, cache, and loading examples live in `playground/` |
| 7.2 | **Minimal starter** — smallest app: flat routes, one hook, one loader | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | README Quick start covers it; no separate `examples/minimal/` package |
| 7.3 | **Nested layouts** — parent layout + child outlet, sibling swaps, inherited guards | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Demo, [`playground/`](./playground/), and [`docs/recipes/nested.md`](./docs/recipes/nested.md) |
| 7.4 | **Auth recipe** — async guard, redirect to login, protected layout shell | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Runnable playground flow plus [`docs/recipes/auth.md`](./docs/recipes/auth.md) |
| 7.5 | **Prefetch & cache recipe** — link intent, cache modes, and invalidation | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Runnable playground flow plus [`docs/recipes/prefetch-cache.md`](./docs/recipes/prefetch-cache.md); navigation-time SWR remains tracked by 2.1 |
| 7.6 | **Not-found recipe** — catch-all routes and fallback handling | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Demo, playground, and [`docs/recipes/not-found.md`](./docs/recipes/not-found.md) |
| 7.7 | **Public hosted demo** — one-click live preview linked from README | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | Static source and production build exist in [`router-preview`](https://github.com/aura-ui/router-preview); deployment URL is still missing |
| 7.8 | **E2E tests** — Playwright suite against the static example | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | `router-preview` covers direct HTML, SPA navigation, history, nested persistence, no-JS fallback, and real 404 |
| 7.9 | **Release 0.1.0** — merge to `main`, npm publish | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Published as [`@auraui/router@0.1.0`](https://www.npmjs.com/package/@auraui/router) ([GitHub release](https://github.com/aura-ui/router/releases/tag/v0.1.0)); earlier [`0.0.1`](https://www.npmjs.com/package/@auraui/router/v/0.0.1) |
| 7.10 | **E2E in CI** — run browser tests automatically | <span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✗</span> | Playwright exists in `router-preview`, but is not wired into automated CI |

> **Remaining:** complete the interactive showcase, deploy the static preview, and run its Playwright suite in CI.

---

## Phase 8 — MPA → SPA

> **Goal:** Server keeps serving ready-made HTML (as today). Inject `<aura-router>` via layout or template. Client upgrades in-app links to SPA navigation — **no Aura runtime on the server**.
>
> Client hydration is enough for the default path; a Node SSR runtime is **not** on the public roadmap.

| # | Task | Status | Notes |
| ---: | --- | :---: | --- |
| <span style="background:#2563eb;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">→</span> **8.1** | **MPA → SPA migration guide** — step-by-step for existing multi-page sites | <span style="background:#f59e0b;color:#111;padding:2px 10px;border-radius:4px;font-weight:700">~</span> | First-paint guide, [`first-paint` recipe](./docs/recipes/first-paint.md), draft article, and `router-preview` walkthrough exist; one canonical migration document remains |
| **8.2** | **Shared layout pattern** — inject `<aura-router>` + routes from CMS/template (EJS, PHP, static partial) | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | [`playground/`](./playground/): `@nav@` / `@router@` → `parts/nav.html` + `parts/router.html`; routes remain HTML and the server does not run Aura |
| **8.3** | **Client hydration** — flat adopt via `extract`; nested via `aura-router-ssr` when shell ≠ leaf; no refetch; slash-fix for index folders | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Engine + [guide First paint](./docs/guide.md#first-paint-mpa--spa); playground flat pages use `extract`; nested demos keep SSR marker; adopt skips `guard`/`load`/`ready` |
| **8.4** | **Static MPA example** — one `.html` document per URL + client bundle | <span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-weight:700">✓</span> | Implemented in [`router-preview`](https://github.com/aura-ui/router-preview): Vite MPA build, direct URLs, static 404, no-JS fallback, and nested first-paint adoption |

> **Remaining:** consolidate the existing migration material into one canonical guide and link it to the static example.

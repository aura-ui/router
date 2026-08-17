# Aura Router — Roadmap

**Declarative routing for Web Components — what is shipped, what is being built, and why it matters.**

> Current release: `0.1.0` · Updated: 2026-08-18
>
> [Tutorial](./docs/tutorial.md) · [README](./README.md) · [Guide](./docs/guide.md) · [Recipes](./docs/recipes/README.md) · [Limitations](./LIMITATIONS.md) · [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md)

## Find your way

| I want to…                                    | Start here                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Build an app with Aura Router                 | [Guide](./docs/guide.md)                                                           |
| See what is already available                 | [README](./README.md) → [Changelog](./CHANGELOG.md)                                |
| Upgrade an existing HTML site from MPA to SPA | [10-minute tutorial](./docs/tutorial.md) → [MPA → SPA roadmap](#phase-8--mpa--spa) |
| Copy a working pattern                        | [Recipes](./docs/recipes/README.md)                                                |
| Understand what is being built now            | [Current focus](#current-focus)                                                    |
| Contribute to a specific area                 | [Explore the roadmap](#explore-the-roadmap)                                        |

### Status

**✅ Shipped** — ready to use · **🟡 Building** — useful foundations already exist · **○ Planned** — not implemented yet · **🎯 Focus** — active priority

---

## Current focus

These are the three outcomes that matter most right now.

### 🎯 8.1 — One clear MPA → SPA migration path

Turn the existing guide, recipe, draft article, playground, and [`router-preview`](https://github.com/aura-ui/router-preview) walkthrough into one step-by-step guide.

**Why it matters:** a developer with a traditional HTML site should be able to adopt client navigation without reverse-engineering the router or adding an Aura server runtime.

**Finish line:** one guide covers server HTML, router injection, flat and nested first paint, link upgrades, deployment, no-JS behavior, and common failure modes.

### 🎯 7.7 — A demo you can open, not just clone

Deploy [`aura-ui/router-preview`](https://github.com/aura-ui/router-preview) and link it from the README.

**Why it matters:** developers should be able to verify direct URLs, SPA navigation, nested layouts, and no-JS fallback before installing anything.

**Finish line:** stable public URL, working direct routes, verified fallback, and a prominent README link.

### 🎯 7.10 — Browser tests on every change

Run the existing Playwright suite automatically in CI.

**Why it matters:** routing bugs often appear only across direct loads, history navigation, nested outlets, or static hosting.

**Finish line:** pull requests run the suite, failures retain useful artifacts, and the result is visible as a required check.

---

## Explore the roadmap

[Engine](#phase-1--routing-engine) · [Data & cache](#phase-2--data-loading--cache) · [Rendering](#phase-3--view-rendering) · [Navigation UX](#phase-4--navigation-experience) · [Developer API](#phase-5--developer-facing-api) · [DevTools](#phase-6--debugging--performance) · [Examples & docs](#phase-7--examples--docs) · [MPA → SPA](#phase-8--mpa--spa)

| Phase | Developer outcome                                           |   Status    |
| ----: | ----------------------------------------------------------- | :---------: |
| **1** | Explicit, typed, and testable navigation stages             | ✅ Shipped  |
| **2** | Predictable route-data loading, caching, and revalidation   | 🟡 Building |
| **3** | Update changed route DOM without losing component state     | 🟡 Building |
| **4** | Navigation built on modern browser APIs with safe fallbacks |  ○ Planned  |
| **5** | Configure routes in HTML with typed JavaScript APIs         | 🟡 Building |
| **6** | Navigation timing and cache diagnostics                     | 🟡 Building |
| **7** | Runnable examples for common routing patterns               | 🟡 Building |
| **8** | Add SPA navigation to existing HTML sites                   |  🎯 Focus   |

## Phase 1 — Routing engine

> **The promise:** every navigation stage and module boundary remains explicit, typed, and independently testable.

The engine is organized as `NavigationCoordinator` → `NavigationTransaction` → `NavigationTransactionPipeline`. Route-tree, prefetch, DataGraph, and view-mount behavior live behind explicit layers with typed internal events.

|   # | Developer outcome                                               | Status | Where to look                                                                    |
| --: | --------------------------------------------------------------- | :----: | -------------------------------------------------------------------------------- |
| 1.1 | Layer contracts and navigation orchestration                    |   ✅   | [`core/ARCHITECTURE.md`](./src/modules/aura-routing-engine/core/ARCHITECTURE.md) |
| 1.2 | Engine modules migrated onto the architecture                   |   ✅   | `src/modules/aura-routing-engine/core/`                                          |
| 1.3 | Typed internal `EventBus`; host maps selected events to the DOM |   ✅   | Architecture guide and DOM events in the [Guide](./docs/guide.md)                |

## Phase 2 — Data loading & cache

> **The promise:** route data loads before rendering and follows explicit cache, reuse, and revalidation rules.

|   # | Developer outcome                                                                          | Status | What remains                                                                                                                                  |
| --: | ------------------------------------------------------------------------------------------ | :----: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | **DataGraph parity** — predictable route-data caching, nested reuse, SWR, and revalidation |   🟡   | Navigation-time SWR, `shouldRevalidate`, the public `defer()` decision, and optional query ignore rules                                       |
| 2.2 | **Out-in prefetch** — prepare the next route view before the current view exits            |   ○    | Intent/tap prefetch and `transition-order="out-in"` exist; off-screen DOM preparation, reuse, and cancellation cleanup remain; depends on 3.1 |

Already usable in 2.1: parallel loads, nested reuse, `ctx.parent()`, unified invalidation, entry timings, and the cache ladder.

## Phase 3 — View rendering

> **The promise:** route changes update only the affected DOM while stable layouts, focus, and component state remain intact.

|   # | Developer outcome                                                               | Status | What remains                                                                                           |
| --: | ------------------------------------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------ |
| 3.1 | **Renderer API** — one predictable `renderNode()` contract for every view       |   🟡   | Route every engine render path through the contract and lock its lifecycle with integration tests      |
| 3.2 | **Incremental DOM** — patch changed nodes instead of replacing full `innerHTML` |   ○    | Preserve focus and component state, define fallback behavior, and validate performance; depends on 3.1 |

The foundation already includes `ViewHandle`, outlet strategies, and view controllers.

## Phase 4 — Navigation experience

> **The promise:** use the browser's View Transitions and Navigation APIs when available, with accessible fallbacks everywhere else.

|   # | Developer outcome                                                             | Status | What remains                                                                             |
| --: | ----------------------------------------------------------------------------- | :----: | ---------------------------------------------------------------------------------------- |
| 4.0 | Loading state through body classes and DOM events                             |   ✅   | Preferred stable API; `loading-template` remains experimental and may be removed         |
| 4.1 | **View Transitions API** — browser-managed cross-fades and slides             |   ○    | Wire `document.startViewTransition`, reduced-motion behavior, fallback, and cancellation |
| 4.2 | **Navigation API** — intercept browser navigation through `window.navigation` |   ○    | Add a navigate/intercept provider while keeping the tested History API fallback          |
|4.3a| **Document meta** — title, description, canonical, OG/Twitter on navigation   |   ✅   | [Guide ch. 4](./docs/guide/04-document-meta.md): extract from fetched HTML, route attrs, `AuraRouter.configure({ documentMeta })`, boot revert |
|4.3b| **Focus after navigation** — accessible focus policy                          |   ○    | Define focus targets, skip rules, nested ownership, first-paint behavior, and tests     |

CSS/WAAPI transitions already work through route attributes in the demo.

## Phase 5 — Developer-facing API

> **The promise:** configure route structure in HTML and use typed JavaScript only for guards, data loaders, hooks, and navigation.

|    # | Developer outcome                                                    | Status | What remains                                                                                                      |
| ---: | -------------------------------------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------------------- |
|  5.1 | Route attributes for `view`, `guard`, `load`, `ready`, `cache`, and document meta |   ✅   | Documented in the [Guide](./docs/guide.md), including [document meta](./docs/guide/04-document-meta.md), cache, errors, and router links |
|  5.2 | Familiar lifecycle and navigation phase names                        |   ✅   | Public phases and their order are documented and tested                                                           |
| 5.2a | Named hooks through `AuraRouter.use()` / `defineRouteHook()`         |   ✅   | Registration, options, version checks, removal, and shared usage are implemented                                  |
| 5.3a | Nested routes, layouts, outlets, and path-only parents               |   ✅   | Available in the engine, guide, demo, playground, and [nested recipe](./docs/recipes/nested.md)                   |
| 5.3b | **Colocated route folders** — optional route/template convention     |   ○    | Define build-time file-system and automatic template wiring, then document it in a runnable example               |
|  5.4 | **Optional `/min` entry** — small core with opt-in capabilities      |   ○    | Validate the size/value target and plugin boundaries; the default `@auraui/router` package stays full             |
|  5.5 | **Basename** — mount under `/app`, GitHub Pages, or a multi-SPA host |   ○    | Add router attr/config and consistent strip/join behavior for matching, links, redirects, navigation, and history |
| 5.6a | **Typed params** — `:userId(int)`, `:slug(slug)`                     |   ○    | Keep types inline in `path`—not a separate `params` attr—define builtins, reject mismatches, and test conflicts   |
| 5.6b | **Optional params** — `:section?`, `:page(int)?`                     |   🟡   | Define route priority, add conflict tests, and document public support                                            |
|  5.7 | **Hook cause** — distinguish `enter`, `prefetch`, and `stay`         |   ○    | Add typed context values so speculative work can avoid analytics or committed DOM side effects                    |
|  5.8 | **Structured targets** — `navigate({ pathname, query, hash })`       |   ○    | Add the object overload, define query serialization, and preserve string, `replace`, and `syncHistory` options    |
|  5.9 | Typed load results and navigation cancellation metadata              |   ✅   | `RouteLoadFn<TData>` is public; optional cancellation `reason` reaches `navigation-cancel`                        |

## Phase 6 — Debugging & performance

> **The promise:** when navigation feels slow or data looks stale, developers can see why.

|   # | Developer outcome                                                     | Status | What remains                                                                                          |
| --: | --------------------------------------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------- |
| 6.1 | **Cache inspector** — see keys, hits, misses, freshness, and eviction |   ○    | Expose stable cache diagnostics and build a dev-only view                                             |
| 6.2 | **Navigation timeline** — visualize prepare → commit → post           |   🟡   | Turn the full internal phase stream into a timeline; public DOM events currently expose only a subset |
| 6.3 | **Per-navigation metrics** — measure prepare, commit, and post phases |   🟡   | Expose per-navigation timings, run repeatable benchmarks in CI, and define regression thresholds      |

Local microbenchmarks, smoke checks, bundle-size CI, `EventBus`, and `NavigationPulse` already provide the foundation.

## Phase 7 — Examples & docs

> **The promise:** every common routing pattern has a focused example that developers can run and copy.

|    # | Developer outcome                                                                    | Status | What remains                                                                                                                          |
| ---: | ------------------------------------------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------------------------------------- |
|  7.1 | **Feature showcase** — discover routing, data, errors, and transitions interactively |   🟡   | Unite the root demo, `public/features/`, and focused playground flows into one coherent journey                                       |
|  7.2 | **Minimal starter** — flat routes, one hook, one loader                              |   🟡   | Turn the README quick start into a canonical runnable starter; no `examples/minimal/` exists yet                                      |
|  7.3 | Nested layouts with persistent parent shells and inherited guards                    |   ✅   | Demo, playground, and [nested recipe](./docs/recipes/nested.md)                                                                       |
|  7.4 | Async auth guard, login redirect, and protected layout shell                         |   ✅   | Runnable playground flow and [auth recipe](./docs/recipes/auth.md)                                                                    |
|  7.5 | Link intent, cache modes, and invalidation                                           |   ✅   | Playground and [prefetch/cache recipe](./docs/recipes/prefetch-cache.md); navigation SWR remains in 2.1                               |
|  7.6 | Catch-all routes and not-found fallback handling                                     |   ✅   | Demo, playground, and [not-found recipe](./docs/recipes/not-found.md)                                                                 |
|  7.7 | **Hosted demo** — one-click public preview                                           |   🎯   | Deploy `router-preview`, verify production routes and no-JS fallback, then link it from README                                        |
|  7.8 | Playwright E2E for the static MPA example                                            |   ✅   | Direct HTML, SPA navigation, history, nested persistence, no-JS fallback, and real 404                                                |
|  7.9 | Publish `@auraui/router@0.1.0`                                                       |   ✅   | [npm package](https://www.npmjs.com/package/@auraui/router) · [GitHub release](https://github.com/aura-ui/router/releases/tag/v0.1.0) |
| 7.10 | **E2E in CI** — browser coverage on every pull request                               |   🎯   | Run the existing Playwright suite as an automated required check with failure artifacts                                               |
| 7.11 | **Document meta guide** — title, head tags, and route attrs on navigation          |   ✅   | [Guide ch. 4](./docs/guide/04-document-meta.md)                                                                                       |

## Phase 8 — MPA → SPA

> **The promise:** keep server-rendered HTML and no-JS fallback while adding SPA navigation for in-app links.

The server continues serving ready-made HTML. Aura Router is injected through a layout or template and upgrades in-app links in the browser—no Aura runtime is required on the server.

|   # | Developer outcome                                                                  | Status | What remains                                                                                                                                       |
| --: | ---------------------------------------------------------------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | **Migration guide** — a reliable path from static/server HTML to client navigation |   🎯   | Consolidate the guide, first-paint recipe, draft article, playground, and `router-preview` walkthrough into one canonical guide linked to the demo |
| 8.2 | Shared layout injection from CMS, EJS, PHP, or static partials                     |   ✅   | Playground injects `@nav@` / `@router@` from `parts/nav.html` and `parts/router.html`; routes stay HTML-only                                       |
| 8.3 | Flat and nested first-paint adoption without refetching                            |   ✅   | `extract` handles flat pages; `aura-router-ssr` preserves nested shells; successful adopt skips `guard`, `load`, and `ready`                       |
| 8.4 | Static MPA reference with direct URLs and no-JS fallback                           |   ✅   | [`router-preview`](https://github.com/aura-ui/router-preview): Vite MPA, static 404, nested adoption, and Playwright coverage                      |
| 8.5 | **Optional backend adapters** — generate Aura-compatible first-paint markup         |   ○    | Define a framework-neutral server contract, then evaluate adapters for nested layouts and route views                                              |

---

## The direction in one sentence

Aura Router is moving toward a router that **starts with real HTML, preserves the platform, and adds data loading, nested layouts, caching, transitions, and client navigation without requiring a framework rewrite**.

<details>
<summary><strong>How this roadmap stays trustworthy</strong></summary>

- `🟡 Building` means a real, usable foundation exists today—not merely that work was discussed.
- `✅ Shipped` means the roadmap outcome is implemented; release-level detail should also be recorded in [`CHANGELOG.md`](./CHANGELOG.md).
- `🎯 Focus` is reserved for active priorities and should remain a short list.
- Current usage belongs in the [README](./README.md) and [Guide](./docs/guide.md).
- Known constraints belong in [`LIMITATIONS.md`](./LIMITATIONS.md).

</details>

# Known limitations

Honest gaps for the current **pre-alpha `0.0.1`** tree. The public API may change before `0.1.0`.

Plans: [ROADMAP.md](./ROADMAP.md) · history: [CHANGELOG.md](./CHANGELOG.md).

## Status

- **Not on npm / `main` yet** — evaluate from the repo (`npm run dev`) or a local `npm pack` tarball. Registry stub `@auraui/router@0.0.0` is expected until the first merge + publish.
- **Packaging works locally** — `exports` / `types` → `dist/`, `npm run build`, `npm run smoke`. Still pre-alpha: pin exact versions; do not treat as a frozen contract.
- **0.x semver** — expect breaking changes until `1.0.0`.
- **Single full entry today** — only `import … from '@auraui/router'`. A lite default + `@auraui/router/full` split is planned (see ROADMAP 5.4), not shipped.
- **Docs may lag code** — trust shipped attrs on `<aura-route>` / README over older design notes.

## API & types

- **No typed routes or codegen** — paths and hook names are strings in HTML; TypeScript will not catch `navigate('/settigns')`.
- **`navigate` is a path string** — `navigate(path, { replace?, syncHistory? })`. No `navigate({ search })` object form; no search-schema attr. Put filters in `?query` and read `ctx.to.query` (raw parsed search).
- **Lifecycle attrs shipped today** — `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error`, plus transition attrs. There is no `reenter` / `detach` / `destroy` / `restore` route attr.
- **`preserve` is gone** — use `cache` (`dom` / `view` / `data` / `screen` / `all`).

## Data layer

- **`cache="data"` is opt-in for long-lived data cache** — without it, `load` does not keep a durable DataGraph entry across navigations. Prefetch → navigate can still reuse work via the short-lived **handoff buffer** (~30s TTL) even without `cache="data"`.
- **Global `staleTime` only** (~30s via `configure({ dataCache })`) — no per-route TTL attrs.
- **Navigation path is cache hit/miss, not product SWR** — DataGraph uses get/set on navigate; no background revalidate of a stale entry into the visible page. No public `shouldRevalidate` or `defer()` API yet.
- **Cache key includes the full query** — unrelated params (e.g. `utm_*`) can reduce cache hits.
- **`invalidate()` vs `invalidateView()`** — `invalidate()` clears data cache; `invalidateView()` clears view-loader cache. There is no `router.load()`. Navigate or prefetch again to refetch. Invalidate alone does not refresh stay-on-page UI.
- **No `cause` in hook context** — enter / prefetch / stay is not exposed on `RouteLifecycleContext`.

## Views & rendering

- **ViewGraph is browser-only** — built-in loaders use `window`, `document`, `fetch`, and `customElements`. No Node SSR view pipeline (`isSSR` is reserved / always false in the browser env). Client MPA→SPA hydration is the intended path (ROADMAP Phase 8).
- **`url` / bare `view`, `html`, `iframe`** — no URL allowlist; content is fetched, embedded, or injected from route attrs. Treat `<aura-route>` markup as **trusted** (XSS risk if content is untrusted).
- **`loading-template`** — turns on body class + `aura-route-loading` event; does **not** clone/mount a skeleton into the outlet.
- **`error-template`** — per-route template clone on error (router attr is the inherit default); also thin fallback UI when there is no `path="*"`. No nested error-boundary hierarchy.
- **Full DOM replace** — no incremental / morph patch renderer yet.
- **View Transitions API** — not wired in the engine (`document.startViewTransition`). CSS / WAAPI transitions via attrs work; demo hooks are separate.
- **Nested routes work; colocated folder templates do not** — HTML nesting + `<aura-outlet>` ship; filesystem-style route folders are not a product feature yet.

## Platform & ecosystem

- **Prefetch that works** — `intent` / `tap` / `manual` (`router.prefetch`). `viewport` / `render` may parse as modes; IntersectionObserver / viewport wiring is not shipped.
- **Hash-history mode** — a `hash` config field exists; the engine does not use it as a routing mode (hash-only URL changes are handled separately for scroll).
- **No router DevTools UI** — typed `router.events` (EventBus) and DOM events ship; there is no timeline / cache inspector panel.
- **No Playwright E2E** — unit/integration tests only.
- **Web Components only** — no React / Vue adapter packages.

## What already works

Nested routes + LCA diff, nested `<aura-outlet>`, lifecycle hooks (`guard` / `load` / `ready` / …), declarative / hook redirects, `param-change`, `mount-strategy`, active links, DataGraph + view loaders (`url` / `import` / `iframe` / `html` / `template` / `component`), prefetch cascade (intent/tap), staged commit / fast path, scroll restoration, URLPattern matcher, `router.events`, `router.invalidate()` / `invalidateView()`, structured `navigation-error` / `not-found`, progressive enhancement with `aura-router-link`.

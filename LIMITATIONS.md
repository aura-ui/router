# Known limitations

Honest gaps for the current **pre-alpha `0.0.1`** tree. The public API may change before `0.1.0`.

Plans: [ROADMAP.md](./ROADMAP.md) · history: [CHANGELOG.md](./CHANGELOG.md).

## Status

- **Published on npm** — [`@auraui/router@0.0.1`](https://www.npmjs.com/package/@auraui/router). Still pre-alpha: pin exact versions; do not treat as a frozen contract.
- **Packaging** — `exports` / `types` → `dist/`; `npm run build` + `npm run smoke` for local verification.
- **0.x semver** — expect breaking changes until `1.0.0`.
- **Single full entry today** — only `import … from '@auraui/router'`. A lite default + `@auraui/router/full` split is planned (see ROADMAP 5.4), not shipped.
- **Docs may lag code** — trust shipped attrs on `<aura-route>` / [README](./README.md) / [docs/guide.md](./docs/guide.md) over older design notes.

## API & types

- **No typed routes or codegen** — paths and hook names are strings in HTML; TypeScript will not catch `navigate('/settigns')`.
- **`navigate` is a path string** — `navigate(path, { replace?, syncHistory? })`. No `navigate({ search })` object form; no search-schema attr. Put filters in `?query` and read `ctx.to.query` (raw parsed search).
- **Lifecycle attrs shipped today** — `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error`, plus transition attrs. There is no `reenter` / `detach` / `destroy` / `restore` route attr.
- **`preserve` is gone** — use `cache` (`dom` / `view` / `data` / `all`; bare `cache` = view + data). There is no `screen` mode.

## Data layer

- **`cache="data"` is opt-in for long-lived data cache** — without it, `load` does not keep a durable DataGraph entry across navigations. Prefetch → navigate can still reuse work via the short-lived **handoff buffer** (~30s TTL) even without `cache="data"`.
- **Per-route TTL** — `cache-time` / `cache-refresh` override store defaults from `configure({ dataCache })`. On the current nav path (`get`/`set`) only `cache-time` (`gcTime`) affects hit/miss; `cache-refresh` is for future `resolve`.
- **Navigation path is cache hit/miss, not product SWR** — DataGraph uses get/set on navigate; no background revalidate of a stale entry into the visible page. No public `shouldRevalidate` or `defer()` API yet.
- **Cache key includes the full query** — unrelated params (e.g. `utm_*`) can reduce cache hits.
- **`invalidate({ cache? })`** — default clears **data** cache; `cache: 'view'` clears view-loader cache; `cache: 'all'` clears both. There is no `router.load()`. Navigate or prefetch again to refetch. Invalidate alone does not refresh stay-on-page UI.
- **No `cause` in hook context** — enter / prefetch / stay is not exposed on `RouteLifecycleContext`.

## Views & rendering

- **ViewGraph is browser-only** — built-in loaders use `window`, `document`, `fetch`, and `customElements`. No Node SSR view pipeline (`isSSR` is reserved / always false in the browser env). Client adopt of server HTML is shipped (`aura-router-initial-view`); there is still no server-side Aura render.
- **First-paint hydrate skips the nav pipeline** — successful adopt does **not** run `guard` / `load` / `ready` (or other lifecycle). Auth and data for the landing URL must already be in the server HTML (or rely on later navigations). Failure / missing marker still uses normal `initNavigate`.
- **Nested hydrate is strict** — layout chains adopt only when markup mirrors the client tree: direct-child `<aura-outlet>` + `data-aura-view-root` per level. A flat blob for a nested match falls back to a full first navigation (refetch).
- **`url` / bare `view`, `html`, `iframe`** — no URL allowlist; content is fetched, embedded, or injected from route attrs. Treat `<aura-route>` markup as **trusted** (XSS risk if content is untrusted).
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

Nested routes + LCA diff, nested `<aura-outlet>`, lifecycle hooks (`guard` / `load` / `ready` / …), declarative / hook redirects, `param-change`, `mount-strategy`, active links, DataGraph + view loaders (`url` / `import` / `iframe` / `html` / `template` / `component`), prefetch cascade (intent/tap), staged commit / fast path, scroll restoration, URLPattern matcher, `router.events`, `router.invalidate({ cache: 'data' | 'view' | 'all' })`, structured `navigation-error` / `not-found`, progressive enhancement with `aura-router-link`, first-paint adopt via `aura-router-initial-view` (flat + nested when markup matches).

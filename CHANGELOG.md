# Changelog

All notable changes to `@auraui/router` are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Package version in `package.json` is **`0.0.1`**, published as [`@auraui/router`](https://www.npmjs.com/package/@auraui/router). Everything below is that first public cut.

## [0.0.1]

### Added

- **Routing engine architecture** — `NavigationCoordinator` → `NavigationTransaction` → `NavigationTransactionPipeline` (match → guards → prepare/load → render → effects); modules under `aura-routing-engine/core/` (route-tree, prefetch, DataGraph, ViewGraph, resource-graph, view-mount, history, redirect, failure).
- **Named route hooks** — `AuraRouter.use(name, fn)` / `defineRouteHook(name, fn)` for registering lifecycle / transition hooks by name.
- **Loading chrome** — `loading-template`, `loading-body-class`, `loading-start-event` / `loading-end-event` during prepare (after guards → until loads finish); skeleton mounts as staged view when there is no page transition.
- Typed engine `EventBus` + `NavigationPulse` (internal); host surfaces navigation / load via DOM events on `<aura-router>`.
- Jest test suite and Vite demo (`src/examples/demo`) — raw / experimental scratch demo; a proper product demo is still in development.
- Local Fastify playground (`playground/`) for multi-page demos.
- Declarative `redirect` attr (max hop limit); redirect chains resolve pre-commit in a single navigation run.
- View loaders: `url`, `import`, `iframe`, `html`, `template`, `component`; `extract` attr for fragment selection on URL fetches; `view="loader::content"` form; hardened `extract` (`outerHTML` + selector-miss fallback).
- Public lifecycle attrs on `<aura-route>`: `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error` (plus transition attrs). Most inherit from router / parent; **`load` is local only** (data ownership per route).
- `cache` attr ladder **off → `cache` → `dom` → `all`** (plus `view` / `data`; inherit opt-out) — replaces legacy `preserve`; bare `cache` / `cache=""` = view + data (no DOM keep-alive).
- Per-entry `gcTime` / `staleTime` overrides on `AuraSwrCache` / `AuraResolvableSwrCache.set`.
- `param-change` attr (`update` | `navigate`) for same-route param updates / remount.
- `mount-strategy` attr; parallel enter-branch resolve then sync mount (branch-atomic).
- Href matching for nested routes ignores trailing `/` (`/users` ≈ `/users/`); the address bar is not rewritten — prefer root-absolute nav links for MPA→SPA.
- Active links (class + `aria-current`) for `[aura-router-link]`; host `link-*` attrs; branch active class.
- Nested `<aura-outlet>`; root outlet auto-created as sibling of `<aura-router>` when missing; `AuraRouter.prefetch()`, link prefetch cascade (intent / tap).
- **First-paint hydration (MPA → SPA)** — flat pages adopt via `extract` (same selector as SPA fragments); nested layout shells that differ from `extract` use `aura-router-ssr`. Nested adopt needs outlet + `data-aura-view-root` chain; mismatch / redirect / missing adoptable node falls back to normal `initNavigate` (or structure-error keep). Guide: [docs/guide.md](./docs/guide.md#first-paint-mpa--spa).
- DataGraph long cache with global `staleTime` (~30s); unified `router.invalidate({ cache: 'data' | 'view' | 'all' })` and `data-invalidated` event.
- Resource graph (data + view load, resource keys, handoff / shared buffer, in-flight join).
- Transition-plan fast paths (`canUseDomCacheFastPath`, `canUseViewCacheFastPath`).
- `NavigationTransactionPipeline` with `commitHistory` before loads (optimistic history).
- Detached snapshot rollback for replace mounts; pre-resolved view render path.
- Shared-buffer pin strategy (buffer lifetime not tied to a single navigation).
- Scroll restoration and URLPattern-based matcher.
- Structured navigation failures (`NavigationFailure`) + `navigation-error` / `not-found` DOM events; router `error-template` (replaces `not-found-template`).
- Lib packaging: `package.json` `exports` / types / `files`, modular dist emit, `src/index.ts`, `npm run build` → `scripts/build-lib.mjs`, `npm run smoke`; CI workflow with smoke + size checks.

### Changed

- `preserve` attr removed in favor of `cache`; ladder reworked (`screen` removed; bare `cache` = view + data; `dom` includes view-loader fallback); inherit opt-out standardized (`none` / `off` / `false`).
- `load` no longer inherits from `<aura-router>` / parent `<aura-route>` — set on the route that owns the data; children use `ctx.parent()` for ancestor payloads.
- In-app link marker renamed to `aura-router-link`; host link API uses `link-*` attrs (`link-active-class`, …).
- Router `not-found-template` renamed to `error-template`.
- EventBus no longer exposed on `<aura-router>` public API — use DOM events; engine bus stays internal via engine bridge.
- Lifecycle rename to short public attrs: `guard`, `load`, `ready`, `leave`, … (no `reenter` attr; no deprecated `enter` / `after` aliases).
- Single prepare/load phase for navigation; `mount-strategy="per-route"` removed.
- Redirects are not produced from the load phase; redirect follow uses a guard walk (`skipBlockingPhases`).
- DataGraph / ViewGraph owned by resource graph; load vs prefetch is a load `mode`; `preload` alias for prefetch removed.
- Terminal failures modeled as `NavigationFailure`; navigation generations keyed by `transactionId`.
- View attr form is `loader::content` (view-graph module; formerly content-graph).
- Router host split into focused modules (`install`, engine bridge, not-found controller, …); `engine.stop()` stops without destroying.
- `npm run build` emits the library via `scripts/build-lib.mjs` (`tsc -p tsconfig.build.json` + Vite lib); demo shells use `npm run build:demo` / `vite build`.
- No index-folder trailing-slash rewrite in history (`folder-index-url` / `commitPopSlashFix` / canonical slash policy) — match only.

### Fixed

- Cache invalidation clears the shared buffer as well as primary caches; shared buffer also cleared after successful navigation.
- Resource cache keys (`dataKey` / `viewKey`) include route params and the full query string.
- Unmount runs before view commit on param-change remount; transitions/animations wired through the pipeline.
- Active links sync on boot before enter transition finishes; active link highlighted on not-found fallback.
- `splitAppHref` fast path for root-relative app hrefs (not `//…`); link/prefetch resolution skips external / non-app targets.
- Absolute `https://` view URLs are no longer rewritten through the site origin.
- ViewGraph import loader: CE tag checks, teardown, and safer payload cache keys.
- Redirect blocking walk: leave → guard with `skipBlockingPhases`.
- Cancelled navigation restores prior nav state / URL; in-flight nav cancelled on unmatched resolve.
- Loading skeleton: mounts as view (not layout); leaves correctly under `stage` mount; skipped when a page transition is defined; dropped after `update` navigations.

### Performance

- Memoized URL matcher patterns and hot-path helpers.
- Faster active-link / URL helpers; `resourceKeys` for cache-key calculation.
- Optimized `syncActiveLinks` and mount-strategy parsing.

### Known limitations

See [LIMITATIONS.md](./LIMITATIONS.md). Published as [`@auraui/router@0.0.1`](https://www.npmjs.com/package/@auraui/router). Planned later: lite default entry vs `@auraui/router/full`, DataGraph SWR parity (`shouldRevalidate`, public `defer()`), engine `renderNode()`, View Transitions API — see [ROADMAP.md](./ROADMAP.md).

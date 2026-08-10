# Changelog

All notable changes to `@auraui/router` are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Package version in `package.json` is **`0.0.1`**, published as [`@auraui/router`](https://www.npmjs.com/package/@auraui/router). Everything below is that first public cut.

## Unreleased

### Added

- **Path groups** — nested `<aura-route>` without `layout`: joins path/params, stays on the match chain / inheritable attrs, no shell, not a matchable URL by itself. Example: `path=":lang"` wrapping localized pages. Docs: [Nested routes & layouts](./docs/guide.md#nested-routes--layouts).
- **`:param` in `view` content** — path tokens like `view=":lang/page.html"` / `users/:id.html` resolve from matched route params (same shape as `path`; SSR-friendly vs mustache). **Breaking (alpha):** `{{param}}` placeholders in `view` are removed. Docs: [Views](./docs/guide.md#views).

### Changed

- **Same-origin absolute links** — `[aura-router-link]` with `https://…` / `//…` on the document origin (incl. IDN) resolve via `resolveInAppHref` to in-app `pathname+search+hash` (clicks + prefetch); other origins stay full navigations. Docs: [How `href` resolves](./docs/guide.md#how-href-resolves).

## [0.1.0](https://github.com/aura-ui/router/compare/router-v0.0.1...router-v0.1.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* path groups, :param view tokens, and same-origin absolute links ([#16](https://github.com/aura-ui/router/issues/16))
* **view:** resolve view content with :param instead of {{param}}
* **scroll:** add scroll-behavior; same-route re-click; flat first-paint adopt via extract ([#15](https://github.com/aura-ui/router/issues/15))
* **router:** scroll auto|top|none + README and router fixes ([#9](https://github.com/aura-ui/router/issues/9))
* **router:** attr `scroll` values `restore`→`auto`, `manual`→`none`. Absent `scroll` now defaults to `auto` (was no auto-scroll). Use `scroll="none"` to opt out.

### Features

* **hydrate:** adopt flat first paint via extract ([0382daa](https://github.com/aura-ui/router/commit/0382daa57c5f78c08806a37e2393bee985eaea16))
* **links:** spa-navigate same-origin absolute hrefs ([2e0aa62](https://github.com/aura-ui/router/commit/2e0aa62b86e9e3717cdde0ed0cd64e67a32108c1))
* path groups, :param view tokens, and same-origin absolute links ([#16](https://github.com/aura-ui/router/issues/16)) ([d593c35](https://github.com/aura-ui/router/commit/d593c35e3de8b848f954b3c4e4c585e80d1be20e))
* **route-tree:** add path groups without layout shell ([142e00e](https://github.com/aura-ui/router/commit/142e00eb6ed87bc2e901e055e7542e865fc5b02a))
* **router:** scroll attr - default auto, rename modes to auto | top | none ([50850cb](https://github.com/aura-ui/router/commit/50850cb8f96c4dd0796789b324f7ad6f2e347cd9))
* **router:** scroll auto|top|none + README and router fixes ([#9](https://github.com/aura-ui/router/issues/9)) ([a0bd38a](https://github.com/aura-ui/router/commit/a0bd38af2aab7757ffa876843a15be58727cd805))
* **scroll:** add scroll-behavior; same-route re-click; flat first-paint adopt via extract ([#15](https://github.com/aura-ui/router/issues/15)) ([2ac92bc](https://github.com/aura-ui/router/commit/2ac92bc9be7ce41b80359be214230dae33d33d36))
* **scroll:** add scroll-target for post-nav scrollIntoView ([cddcad6](https://github.com/aura-ui/router/commit/cddcad61257368be7f95202b06c293756fa505a8))
* **scroll:** add scroll-target for post-nav scrollIntoView ([#14](https://github.com/aura-ui/router/issues/14)) ([afd24cd](https://github.com/aura-ui/router/commit/afd24cdc502afcf39897f8c93c08de15c49dd550))
* **scroll:** apply scroll-behavior on hash paths ([dc3cc15](https://github.com/aura-ui/router/commit/dc3cc15be6c78c0080bcc954d1c4538f2c3083d4))
* **scroll:** scroll to top on same-route link re-click ([b81900c](https://github.com/aura-ui/router/commit/b81900ca3641b67906cc362a78809c246e2513fb))
* **scroll:** scroll-behavior attr ([e67876b](https://github.com/aura-ui/router/commit/e67876b4c4df8ab0a26b526c119684adea3336fd))
* **view:** resolve view content with :param instead of {{param}} ([2d84765](https://github.com/aura-ui/router/commit/2d84765abdd8d4dc95be8337d3a4f083eb0bfc38))


### Bug Fixes

* decode Cyrillic paths in 404 message ([ec40c87](https://github.com/aura-ui/router/commit/ec40c87ed7661db19aaab97c480c3c4fac5dc051))
* **hooks:** allow synchronous RouteHookFn returns ([ef2a1a4](https://github.com/aura-ui/router/commit/ef2a1a487a850c8e9d122f65cdc45138555878b5))
* let Ctrl/Cmd/middle-click open router links in a new tab ([3ab02d2](https://github.com/aura-ui/router/commit/3ab02d29a5f7aacfe45be334a637d64631ac97be))
* **router:** decode percent-encoded pathnames at URL ingress ([3c82bd8](https://github.com/aura-ui/router/commit/3c82bd8072a9b45a15a627d47489913108a3edae))
* **router:** resolve app outlet via first document &lt;aura-outlet&gt; ([d0745c8](https://github.com/aura-ui/router/commit/d0745c8e3487d08eba64fa127422197f7817fbe8))
* **scroll:** cancel stale rAF on rapid navigation ([6beb208](https://github.com/aura-ui/router/commit/6beb2089fc264c678c90810fadb22733899acd0f))


### Documentation

* add hello@aura-ui.dev contact ([2f7eb9c](https://github.com/aura-ui/router/commit/2f7eb9c182f085f61d65719a2d236049e84fef93))
* add hello@aura-ui.dev contact ([#7](https://github.com/aura-ui/router/issues/7)) ([49412d1](https://github.com/aura-ui/router/commit/49412d17ad6c065a00be62afa656b5e059aa91ed))
* add project README ([d8c1da1](https://github.com/aura-ui/router/commit/d8c1da119d89fc98771a95b2fb8d15c2d9a47c8a))
* add trademark file ([ba7b042](https://github.com/aura-ui/router/commit/ba7b042a87f02d3c0f164f83a1bade6bc4dfeea8))
* document release-please flow; show docs in changelog ([1c6a280](https://github.com/aura-ui/router/commit/1c6a280c422f0600900f408d3141653abb59a442))
* document release-please flow; show docs in changelog ([#12](https://github.com/aura-ui/router/issues/12)) ([074e9fc](https://github.com/aura-ui/router/commit/074e9fc2e4a87b62a2a23252d42ca2ae1b367fe4))
* document route match priority scoring ([65135ce](https://github.com/aura-ui/router/commit/65135ce9ab1b592387201c759aaf6c8ebc029947))
* document route match priority; allow sync RouteHookFn ([#13](https://github.com/aura-ui/router/issues/13)) ([7c20556](https://github.com/aura-ui/router/commit/7c20556b266862a08f1a208ecd865765a04a281f))
* **readme:** reposition README around declarative WC routing ([33a6047](https://github.com/aura-ui/router/commit/33a60473782df153b284938a0dd484965e78d6e3))
* slim LIMITATIONS to real footguns; move contract into guide ([5983931](https://github.com/aura-ui/router/commit/59839319d1039d4dbd27d889031b2d96c8901b11))
* update copyright notice ([22e60da](https://github.com/aura-ui/router/commit/22e60da57f7c65a2bbc67878b8d5c306776c550a))

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

See [LIMITATIONS.md](./LIMITATIONS.md) for known gaps. Published as [`@auraui/router@0.0.1`](https://www.npmjs.com/package/@auraui/router). Planned later: optional `@auraui/router/min`, DataGraph SWR parity (`shouldRevalidate`, public `defer()`), engine `renderNode()`, View Transitions API — see [ROADMAP.md](./ROADMAP.md).

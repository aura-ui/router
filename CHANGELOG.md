# Changelog

All notable changes to `@auraui/router` are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Package version in `package.json` is **`0.3.0`**, published as [`@auraui/router`](https://www.npmjs.com/package/@auraui/router).

## Unreleased

## [0.4.0](https://github.com/aura-ui/router/compare/router-v0.3.0...router-v0.4.0) (2026-08-27)


### ⚠ BREAKING CHANGES

* **router:** change default links-selector from [aura-router-link] to [data-aura-link] ([#34](https://github.com/aura-ui/router/issues/34))
* path groups, :param view tokens, and same-origin absolute links ([#16](https://github.com/aura-ui/router/issues/16))
* **view:** resolve view content with :param instead of {{param}}
* **scroll:** add scroll-behavior; same-route re-click; flat first-paint adopt via extract ([#15](https://github.com/aura-ui/router/issues/15))
* **router:** scroll auto|top|none + README and router fixes ([#9](https://github.com/aura-ui/router/issues/9))
* **router:** attr `scroll` values `restore`→`auto`, `manual`→`none`. Absent `scroll` now defaults to `auto` (was no auto-scroll). Use `scroll="none"` to opt out.

### Features

* **hooks:** add typed load hook support ([c1715b1](https://github.com/aura-ui/router/commit/c1715b1c402db07b11231dc9ba494cad0120ae6f))
* **hydrate:** adopt flat first paint via extract ([0382daa](https://github.com/aura-ui/router/commit/0382daa57c5f78c08806a37e2393bee985eaea16))
* **links:** spa-navigate same-origin absolute hrefs ([2e0aa62](https://github.com/aura-ui/router/commit/2e0aa62b86e9e3717cdde0ed0cd64e67a32108c1))
* **meta:** sync document title, description, canonical, and OG/Twitter on navigation ([#29](https://github.com/aura-ui/router/issues/29)) ([43e759a](https://github.com/aura-ui/router/commit/43e759adc118b30e8a2be97c2d5e99dea41570a8))
* path groups, :param view tokens, and same-origin absolute links ([#16](https://github.com/aura-ui/router/issues/16)) ([d593c35](https://github.com/aura-ui/router/commit/d593c35e3de8b848f954b3c4e4c585e80d1be20e))
* **route-tree:** add path groups without layout shell ([142e00e](https://github.com/aura-ui/router/commit/142e00eb6ed87bc2e901e055e7542e865fc5b02a))
* **router:** propagate hook cancellation reasons ([8535960](https://github.com/aura-ui/router/commit/8535960126f5bf33be17fb5fcaf656eadc7cb814))
* **router:** scroll attr - default auto, rename modes to auto | top | none ([50850cb](https://github.com/aura-ui/router/commit/50850cb8f96c4dd0796789b324f7ad6f2e347cd9))
* **router:** scroll auto|top|none + README and router fixes ([#9](https://github.com/aura-ui/router/issues/9)) ([a0bd38a](https://github.com/aura-ui/router/commit/a0bd38af2aab7757ffa876843a15be58727cd805))
* **scroll:** add scroll-behavior; same-route re-click; flat first-paint adopt via extract ([#15](https://github.com/aura-ui/router/issues/15)) ([2ac92bc](https://github.com/aura-ui/router/commit/2ac92bc9be7ce41b80359be214230dae33d33d36))
* **scroll:** add scroll-target for post-nav scrollIntoView ([cddcad6](https://github.com/aura-ui/router/commit/cddcad61257368be7f95202b06c293756fa505a8))
* **scroll:** add scroll-target for post-nav scrollIntoView ([#14](https://github.com/aura-ui/router/issues/14)) ([afd24cd](https://github.com/aura-ui/router/commit/afd24cdc502afcf39897f8c93c08de15c49dd550))
* **scroll:** apply scroll-behavior on hash paths ([dc3cc15](https://github.com/aura-ui/router/commit/dc3cc15be6c78c0080bcc954d1c4538f2c3083d4))
* **scroll:** scroll to top on same-route link re-click ([b81900c](https://github.com/aura-ui/router/commit/b81900ca3641b67906cc362a78809c246e2513fb))
* **scroll:** scroll-behavior attr ([e67876b](https://github.com/aura-ui/router/commit/e67876b4c4df8ab0a26b526c119684adea3336fd))
* **view:** resolve search on view (?* and allowlist) ([#28](https://github.com/aura-ui/router/issues/28)) ([d6e889b](https://github.com/aura-ui/router/commit/d6e889b2df9c042d2247556447edd720273ff84f))
* **view:** resolve view content with :param instead of {{param}} ([2d84765](https://github.com/aura-ui/router/commit/2d84765abdd8d4dc95be8337d3a4f083eb0bfc38))


### Bug Fixes

* decode Cyrillic paths in 404 message ([ec40c87](https://github.com/aura-ui/router/commit/ec40c87ed7661db19aaab97c480c3c4fac5dc051))
* **hooks:** allow synchronous RouteHookFn returns ([ef2a1a4](https://github.com/aura-ui/router/commit/ef2a1a487a850c8e9d122f65cdc45138555878b5))
* let Ctrl/Cmd/middle-click open router links in a new tab ([3ab02d2](https://github.com/aura-ui/router/commit/3ab02d29a5f7aacfe45be334a637d64631ac97be))
* **router:** decode percent-encoded pathnames at URL ingress ([3c82bd8](https://github.com/aura-ui/router/commit/3c82bd8072a9b45a15a627d47489913108a3edae))
* **router:** resolve app outlet via first document &lt;aura-outlet&gt; ([d0745c8](https://github.com/aura-ui/router/commit/d0745c8e3487d08eba64fa127422197f7817fbe8))
* **scroll:** cancel stale rAF on rapid navigation ([6beb208](https://github.com/aura-ui/router/commit/6beb2089fc264c678c90810fadb22733899acd0f))


### Documentation

* add 10 minutes tutorial ([8ff6adb](https://github.com/aura-ui/router/commit/8ff6adbbeeb016bc7437e99d25238bd2ad5dc64b))
* add 10 minutes tutorial ([#23](https://github.com/aura-ui/router/issues/23)) ([17b06db](https://github.com/aura-ui/router/commit/17b06db143a1484c73166df4431df88792b5e5fa))
* add hello@aura-ui.dev contact ([2f7eb9c](https://github.com/aura-ui/router/commit/2f7eb9c182f085f61d65719a2d236049e84fef93))
* add hello@aura-ui.dev contact ([#7](https://github.com/aura-ui/router/issues/7)) ([49412d1](https://github.com/aura-ui/router/commit/49412d17ad6c065a00be62afa656b5e059aa91ed))
* add project README ([d8c1da1](https://github.com/aura-ui/router/commit/d8c1da119d89fc98771a95b2fb8d15c2d9a47c8a))
* add trademark file ([ba7b042](https://github.com/aura-ui/router/commit/ba7b042a87f02d3c0f164f83a1bade6bc4dfeea8))
* add what-aura-is-not doc ([957a403](https://github.com/aura-ui/router/commit/957a403383e492142bc5849a3bb0f591c1f154a9))
* add what-aura-is-not doc ([#37](https://github.com/aura-ui/router/issues/37)) ([1c41a01](https://github.com/aura-ui/router/commit/1c41a01c15c99cbab43b47200dbcabef4ede5e34))
* document release-please flow; show docs in changelog ([1c6a280](https://github.com/aura-ui/router/commit/1c6a280c422f0600900f408d3141653abb59a442))
* document release-please flow; show docs in changelog ([#12](https://github.com/aura-ui/router/issues/12)) ([074e9fc](https://github.com/aura-ui/router/commit/074e9fc2e4a87b62a2a23252d42ca2ae1b367fe4))
* document route match priority scoring ([65135ce](https://github.com/aura-ui/router/commit/65135ce9ab1b592387201c759aaf6c8ebc029947))
* document route match priority; allow sync RouteHookFn ([#13](https://github.com/aura-ui/router/issues/13)) ([7c20556](https://github.com/aura-ui/router/commit/7c20556b266862a08f1a208ecd865765a04a281f))
* improve guide structure and readability ([50905db](https://github.com/aura-ui/router/commit/50905db90d45d104431531699e9debea4a4c8efc))
* improve recipe clarity ([12ef45e](https://github.com/aura-ui/router/commit/12ef45e2756f4038ae8ac421bde1c0a1d8c6ccfc))
* minimize recipe clarity ([459131c](https://github.com/aura-ui/router/commit/459131c90b283b27c46f81bc7c124213563b8307))
* **readme:** add awesome badge ([0af1eb8](https://github.com/aura-ui/router/commit/0af1eb8607808216830822f471784df69ec6b1b6))
* **readme:** add awesome badge ([#36](https://github.com/aura-ui/router/issues/36)) ([debedc4](https://github.com/aura-ui/router/commit/debedc4d3fe9c278f94a8cffa6b6682f0d73ae24))
* **readme:** add dev.to link article ([5e7076a](https://github.com/aura-ui/router/commit/5e7076ade783aed889c5f22e9780b7c16e774281))
* **readme:** add dev.to link article ([#26](https://github.com/aura-ui/router/issues/26)) ([a446a11](https://github.com/aura-ui/router/commit/a446a11068643ee38a144c85daafcc1b81ccb9b4))
* **readme:** add live demo link ([18e3cbd](https://github.com/aura-ui/router/commit/18e3cbd37b75a570516e76973b0912ba1483baa5))
* **readme:** add live demo link ([#21](https://github.com/aura-ui/router/issues/21)) ([80c1a83](https://github.com/aura-ui/router/commit/80c1a832a2ce83b5066700a8686fcccc727bb363))
* **readme:** add MANA design principles ([#35](https://github.com/aura-ui/router/issues/35)) ([9aff489](https://github.com/aura-ui/router/commit/9aff4893e5ce9e0ead72b1b57d6ab754a846f367))
* **readme:** add StackBlitz playground link ([1b61f06](https://github.com/aura-ui/router/commit/1b61f06998c48bc9ba624bb9171c182670953592))
* **readme:** add StackBlitz playground link ([#22](https://github.com/aura-ui/router/issues/22)) ([242a988](https://github.com/aura-ui/router/commit/242a988c6a78d4f633196f2bb62158751f120005))
* **readme:** lead README with HTML-first client navigation ([708f430](https://github.com/aura-ui/router/commit/708f4304479c59fc4ac0df3328e6fc5b6ab5b0c3))
* **readme:** lead README with HTML-first client navigation ([#27](https://github.com/aura-ui/router/issues/27)) ([d42d933](https://github.com/aura-ui/router/commit/d42d933f7f64e0e64b517e33062c758f427541c4))
* **readme:** reposition README around declarative WC routing ([33a6047](https://github.com/aura-ui/router/commit/33a60473782df153b284938a0dd484965e78d6e3))
* **roadmap:** add meta title and focus point, also backend adapters ([645d022](https://github.com/aura-ui/router/commit/645d0223b9384028a629ad5c08238516b09d53a5))
* **roadmap:** add meta title and focus point, also backend adapters ([#24](https://github.com/aura-ui/router/issues/24)) ([d0314f7](https://github.com/aura-ui/router/commit/d0314f7226d18ead044eb7f9aefb3f3970f8f78f))
* **roadmap:** refocus roadmap on upcoming developer experience ([d372ce6](https://github.com/aura-ui/router/commit/d372ce616ba2b20851b609b6022461b9a6204abf))
* **roadmap:** sync with actual code base ([e9670a1](https://github.com/aura-ui/router/commit/e9670a19e28010289636826efae3d5c9f6642ea9))
* simplify readme, update roadmap and guide ([4d2a355](https://github.com/aura-ui/router/commit/4d2a35585c8326e4926b45ef6faf8acd9ccace42))
* slim LIMITATIONS to real footguns; move contract into guide ([5983931](https://github.com/aura-ui/router/commit/59839319d1039d4dbd27d889031b2d96c8901b11))
* split guide into chapters; feat(hooks)!: typed load hooks and cancel reasons ([#20](https://github.com/aura-ui/router/issues/20)) ([3bd7d10](https://github.com/aura-ui/router/commit/3bd7d100cedc787274a2030990064d6cc9414b59))
* split guide into focused navigable chapters ([f10f0b0](https://github.com/aura-ui/router/commit/f10f0b0c4310d3d2a558472ac95cfeb618939550))
* update copyright notice ([22e60da](https://github.com/aura-ui/router/commit/22e60da57f7c65a2bbc67878b8d5c306776c550a))


### Code Refactoring

* **router:** change default links-selector from [aura-router-link] to [data-aura-link] ([#34](https://github.com/aura-ui/router/issues/34)) ([02db642](https://github.com/aura-ui/router/commit/02db642faf9cc35e592d9d10699475beaf5ae353))

## [0.3.0](https://github.com/aura-ui/router/compare/v0.2.0...v0.3.0) - 25.08.2026

### ⚠ BREAKING CHANGES

- **In-app link marker** — default `links-selector` is now `[data-aura-link]` (was `[aura-router-link]`). Rename the attribute on your anchors, or set `links-selector="[aura-router-link]"` on `<aura-router>` to keep the old marker. Docs: [Routes and navigation](./docs/guide/02-routes-and-navigation.md). See [#34](https://github.com/aura-ui/router/pull/34).

### Documentation

- README: add **MANA** design principles (Minimal, Aligned, Native, Additive) alongside MAGA. See [#35](https://github.com/aura-ui/router/pull/35).

## [0.2.0](https://github.com/aura-ui/router/compare/v0.1.0...v0.2.0) - 21.08.2026

### ⚠ BREAKING CHANGES

- **Hook continuation** — `{ type: 'continue' }` is no longer recognized. Return `void`, `undefined`, or `true` to proceed. See [#20](https://github.com/aura-ui/router/pull/20).

### Added

- **Typed load hooks** — export `RouteLoadFn` for typed, data-producing `load` hooks. Docs: [Lifecycle and route data](./docs/guide/05-lifecycle-and-data.md). See [#20](https://github.com/aura-ui/router/pull/20).
- **Cancel reasons** — `{ type: 'cancel', reason? }` propagates the optional machine-readable reason to the `navigation-cancel` event.
- **View search** — resolve query on `view`: `?*` (raw match search) or allowlist/remap (`?id=:id&tag=:tag`). Docs: [Views](./docs/guide/03-views-and-layouts.md#views). See [#28](https://github.com/aura-ui/router/pull/28).
- **Document meta** — sync document title, description, canonical, and OG/Twitter on navigation (from leaf HTML `url` views, with route attrs `meta-title` / `meta-title-template` / `meta-description` / `meta-canonical` and optional `AuraRouter.configure({ documentMeta })` slots). Docs: [Document meta](./docs/guide/04-document-meta.md). See [#29](https://github.com/aura-ui/router/pull/29).

### Documentation

- Split the guide into focused chapters with prev/next navigation; `docs/guide.md` is the index. See [#20](https://github.com/aura-ui/router/pull/20).
- Add [10-minute tutorial](./docs/tutorial.md). See [#23](https://github.com/aura-ui/router/pull/23).
- Lead README with HTML-first client navigation; add live demo, StackBlitz playground, and dev.to article links.
- Refocus roadmap; clarify recipes (auth, nested, prefetch-cache, not-found, first-paint).

## [0.1.0](https://github.com/aura-ui/router/compare/v0.0.1...v0.1.0) - 10.08.2026

### ⚠ BREAKING CHANGES

- **`scroll` attr** — values are `auto` | `top` | `none` (was `restore` | `top` | `manual`). Absent `scroll` now defaults to `auto` (push → top, back → restore). Opt out with `scroll="none"`. See [#9](https://github.com/aura-ui/router/pull/9).
- **`:param` in `view` content** — path tokens like `view=":lang/page.html"` / `users/:id.html` resolve from matched route params (same shape as `path`; SSR-friendly vs mustache). `{{param}}` placeholders in `view` are removed. Docs: [Views](./docs/guide/03-views-and-layouts.md#views).
- **Flat first-paint adopt** — flat pages adopt via `extract` (same selector as SPA fragments); nested layout shells that differ from `extract` still use `aura-router-ssr`. See [#15](https://github.com/aura-ui/router/pull/15). Guide: [First paint (MPA → SPA)](./docs/guide/06-mpa-to-spa.md#first-paint-mpa--spa).

### Added

- **Path groups** — nested `<aura-route>` without `layout`: joins path/params, stays on the match chain / inheritable attrs, no shell, not a matchable URL by itself. Example: `path=":lang"` wrapping localized pages. Docs: [Nested routes & layouts](./docs/guide/03-views-and-layouts.md#nested-routes--layouts). See [#16](https://github.com/aura-ui/router/pull/16).
- **`scroll-target`** — CSS selector for post-nav `scrollIntoView` (ignored when restoring a saved position or `scroll="none"`). See [#14](https://github.com/aura-ui/router/pull/14).
- **`scroll-behavior`** — native scroll animation (`smooth` | `instant` | `auto`); also applied on URL hash anchor scroll. See [#15](https://github.com/aura-ui/router/pull/15).
- **Same-route re-click** — navigating again to the current pathname+search reasserts scroll like a fresh push (`scroll` / `scroll-target` / `scroll-behavior`).

### Changed

- **Same-origin absolute links** — `[aura-router-link]` with `https://…` / `//…` on the document origin (incl. IDN) resolve via `resolveInAppHref` to in-app `pathname+search+hash` (clicks + prefetch); other origins stay full navigations. Docs: [How `href` resolves](./docs/guide/02-routes-and-navigation.md#how-href-resolves).

### Fixed

- Decode percent-encoded UTF-8 pathnames at URL ingress (non-ASCII paths match correctly).
- Decode percent-encoded UTF-8 paths in the 404 / not-found message.
- Resolve the app outlet via the first document `<aura-outlet>` (more reliable root outlet lookup).
- Allow synchronous `RouteHookFn` returns (hooks need not always return a Promise).
- Let Ctrl/Cmd/middle-click open router links in a new tab (do not SPA-hijack modified clicks).
- Cancel stale `requestAnimationFrame` scroll work on rapid navigation.

### Documentation

- Reposition README around declarative Web Components routing.
- Add `hello@aura-ui.dev` contact on README / community docs.
- Document route match priority scoring. See [#13](https://github.com/aura-ui/router/pull/13).
- Document release-please flow; show docs entries in the changelog. See [#12](https://github.com/aura-ui/router/pull/12).
- Slim `LIMITATIONS.md` to real footguns; move contract detail into the guide.

### Miscellaneous

- Polish GitHub community files (issue/PR templates, Code of Conduct) and package metadata.
- Automate version bumps and changelog drafting with release-please (CI).

## [0.0.1](https://github.com/aura-ui/router/releases/tag/v0.0.1) - 30.07.2026

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
- **First-paint hydration (MPA → SPA)** — mark server HTML with `aura-router-ssr`; on boot the engine **adopts** flat or nested markup (nested needs outlet + `data-aura-view-root` chain) instead of refetching; mismatch / redirect / missing marker falls back to normal `initNavigate`. Guide: [docs/guide.md](./docs/guide/06-mpa-to-spa.md#first-paint-mpa--spa).
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

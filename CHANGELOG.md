# Changelog

All notable changes to `@auraui/router` are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Package version in `package.json` is **`0.0.1`**. Nothing from this tree has been merged to `main` or published to npm yet — everything below is unreleased WIP toward the first public cut.

## [Unreleased]

### Added

- Routing engine, Jest tests, and Vite demo (feature branches; not on `main`).
- Declarative `redirect` attr (max hop limit); redirect chains resolve pre-commit in a single navigation run.
- View loaders: `url`, `import`, `iframe`, `html`, `template`, `component`; `extract` attr for fragment selection on URL fetches.
- `param-change` attr (`update` | `navigate`) for same-route param updates / remount.
- `mount-strategy` attr; parallel enter-branch resolve then sync mount (branch-atomic).
- Canonical href resolution and trailing-slash policy for nested routes.
- Active links (class + `aria-current`), router trail entry, branch active class.
- Nested `<aura-outlet>`, `AuraRouter.prefetch()`, link prefetch cascade (intent / tap).
- DataGraph long cache with global `staleTime` (~30s); `router.invalidate()` and `data-invalidated` event.
- Navigation events bus, navigation pulse, nav outcome handling (including after view commit).
- Resource graph (data + view load, resource keys, handoff / shared buffer, in-flight join).
- Transition-plan fast paths (`canUseDomCacheFastPath`, `canUseViewCacheFastPath`).
- `NavigationTransactionPipeline` with `commitHistory` before loads (optimistic history).
- Detached snapshot rollback for replace mounts; pre-resolved view render path.
- Shared-buffer pin strategy (buffer lifetime not tied to a single navigation).

### Changed

- `preserve` attr replaced by `cache` (`data` / `view` / `screen` / `all` / `dom`); inherit opt-out standardized.
- Lifecycle attrs: `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error` (plus transition attrs). No `reenter` attr.
- Single prepare/load phase for navigation; `mount-strategy="per-route"` removed.
- Redirects are not produced from the load phase; redirect follow uses a guard walk (`skipBlockingPhases`).
- DataGraph / ViewGraph owned by resource graph; load vs prefetch is a load `mode`.
- Terminal failures modeled as `NavigationFailure`; navigation generations keyed by `transactionId`.
- View attr form is `loader::content` (view-graph module; formerly content-graph).
- `npm run build` is `tsc && vite build` (typecheck/emit + Vite demo shells).

### Fixed

- Cache invalidation clears the shared buffer as well as primary caches.
- Resource cache keys (`dataKey` / `viewKey`) include route params and the full query string.
- Unmount runs before view commit on param-change remount; transitions/animations wired through the pipeline.
- Active links sync on boot before enter transition finishes.
- `splitAppHref` fast path for root-relative app hrefs (not `//…`); link/prefetch resolution skips external / non-app targets.
- ViewGraph import loader: CE tag checks, teardown, and safer payload cache keys.
- Redirect blocking walk: leave → guard with `skipBlockingPhases`.

### Performance

- Memoized URL matcher patterns and hot-path helpers.
- Faster active-link / URL helpers; `resourceKeys` for cache-key calculation.

### Known limitations

See [LIMITATIONS.md](./LIMITATIONS.md). Packaging (`exports` / public entry) is still unfinished — see the pre-release checklist.

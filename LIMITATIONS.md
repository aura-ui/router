# Known limitations

Honest gaps for the current **unreleased `0.0.1`** tree. The public API may change before the first npm / `main` publish.

Plans: [docs/ROADMAP.md](./docs/ROADMAP.md) · checklist: [docs/todo/PRE_RELEASE_0.0.1.md](./docs/todo/PRE_RELEASE_0.0.1.md).

## Status

- **Not published** — no release on `main` / npm. Use the repo and Vite demo.
- **Package entry unfinished** — `package.json` has `"main": "index.js"` without a real public barrel / `exports` / `types` yet. Do not `npm install` this as a finished library.
- **0.x semver** — expect breaking changes until `1.0.0`; pin exact versions when you publish.
- **Docs may lag code** — trust shipped attrs on `<aura-route>` over aspirational README / design-doc names.

## API & types

- **No typed routes or codegen** — paths and hook names are strings in HTML; TypeScript will not catch `navigate('/settigns')`.
- **`navigate` is a path string** — signature is `navigate(path, { replace?, syncHistory? })`. No `navigate({ search })` object form; no search-schema attr. Put filters in `?query` and read `ctx.to.query` (raw parsed search).
- **Lifecycle attrs shipped today** — `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error`, plus transition attrs. There is no `reenter` / `detach` / `destroy` / `restore` route attr.

## Data layer

- **`cache="data"` is opt-in** — without it, `load` runs every navigation.
- **Global `staleTime` only** (~30s via `configure({ dataCache })`) — no per-route TTL attrs.
- **Navigation path is cache hit/miss, not product SWR** — DataGraph serves via `get`/`set` on navigate; it does not background-revalidate a stale entry and refresh the visible page in place.
- **Cache key includes the full query** — unrelated params (e.g. `utm_*`) can reduce cache hits.
- **`invalidate()` clears cache** — there is no `router.load()`. Navigate or prefetch again to refetch. No stay-on-page data UI refresh after invalidate alone.
- **No `cause` in hook context** — enter / prefetch / stay is not exposed on `RouteLifecycleContext`.

## Views & security

- **ViewGraph is browser-only** — built-in loaders use `window`, `document`, `fetch`, and `customElements`; SSR view loading is not implemented (`isSSR` is reserved / always false in the browser env).
- **`url` / bare `view`, `html`, `iframe`** — no URL allowlist; content is fetched, embedded, or injected from route attrs. Treat `<aura-route>` markup as **trusted** (XSS risk if content is untrusted).
- **`loading-template`** — turns on body class + `aura-route-loading` event; does **not** clone/mount a skeleton into the outlet.
- **`error-template`** — per-route template clone on error; no nested error-boundary hierarchy.

## Platform & ecosystem

- **Prefetch that works** — `intent` / `tap` / `manual` (`router.prefetch`). `viewport` / `render` may parse as modes; IntersectionObserver wiring is not shipped.
- **Hash-history mode** — a `hash` config field exists; the engine does not use it as a routing mode (hash-only URL changes are handled separately).
- **No router DevTools** — use DOM events / the navigation bus and browser tools.
- **Web Components only** — no React / Vue adapter packages.

## What already works

Nested routes + LCA diff, nested `<aura-outlet>`, lifecycle hooks, declarative / hook redirects, `param-change`, `mount-strategy`, active links, DataGraph + view loaders (`url` / `import` / `iframe` / `html` / `template` / `component`), prefetch cascade (intent/tap), scroll restoration, `router.invalidate()`, progressive enhancement with `data-router-link`.

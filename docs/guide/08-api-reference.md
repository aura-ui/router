# Chapter 8 — API reference

Look up router defaults, JavaScript methods, DOM events, and compatibility requirements.

[← Errors and accessibility](./07-errors-and-accessibility.md) · [Guide index](../guide.md)

---

## Router defaults

Attributes on `<aura-router>` have one of two roles: they either provide defaults for descendant routes or configure the router host itself.

### Inherited route defaults

| Group                | Attributes                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hooks                | `guard`, `ready`, `leave`, `unmount`, `update`, `error`; never `load`                                             |
| Views/errors/loading | `extract`, `error-template`, `loading-template`, `loading-body-class`, `loading-start-event`, `loading-end-event` |
| Navigation policy    | `param-change`, `scroll`, `scroll-target`, `scroll-behavior`, `prefetch`                                          |
| Cache                | `cache`, `cache-time`, `cache-refresh`                                                                            |
| Transitions          | `transition`, `transition-in`, `transition-out`, `transition-order`                                               |

A child route can override any inherited value. Where supported, `none`, `off`, or `false` disables the inherited behaviour.

`load` is intentionally route-local and never inherits from `<aura-router>` or a parent route.

### Router-only settings

| Attribute                  | Default / purpose                                                         |
| -------------------------- | ------------------------------------------------------------------------- |
| `outlet`                   | Selector; otherwise first document outlet, otherwise auto-created sibling |
| `links-selector`           | `[aura-router-link]`                                                      |
| `links-container-selector` | Whole document when absent                                                |
| `link-active-class`        | No default; classes for exact active links                                |
| `link-active-branch-class` | No default; classes for active parent-section links                       |

These settings belong to the router host and are not inherited by routes.

### Override a default

Set shared behaviour once on the router, then override only the routes that differ:

```html
<aura-router scroll="auto" prefetch="intent" cache>
  <aura-route path="/feed" view="feed.html"></aura-route>
  <aura-route
    path="/checkout"
    view="checkout.html"
    cache="off"
    prefetch="false"
  ></aura-route>
</aura-router>
```

## Programmatic API

Most applications define routes in HTML. Use the JavaScript API when code needs to navigate, prepare a route, invalidate cached work, register extensions, or update route markup at runtime.

### Install and configure

```ts
AuraRouter.install(): void
AuraRouter.configure(options: AuraRouterConfigureOptions): void
```

`install()` registers Aura's custom elements. Call it once during application setup.

`configure()` sets shared cache options and the global not-found handler. Configuration cache times use milliseconds:

```ts
AuraRouter.configure({
  domCache: { max: 10 },
  viewCache: { max: 50, gcTime: 43_200_000 },
  dataCache: { staleTime: 30_000, gcTime: 300_000 },
});
```

### Register hooks and loaders

```ts
defineRouteHook(name, fn, meta?): RouteHookDefinition
AuraRouter.use(name, fn, options?): void
AuraRouter.use(definition, options?): void
AuraRouter.unuse(name): boolean
AuraRouter.registerLoader(id, fn, { needsData? }?): void
AuraRouter.getLoader(id): Loader
```

`defineRouteHook()` creates a reusable versioned definition. Hook options passed to `use()` are available as `ctx.options`. `unuse()` returns whether the named hook existed.

Hooks and loaders use shared process-wide registries. `getLoader()` throws when the loader id is unknown.

### Navigate and prefetch

```ts
router.navigate(path, { replace?, syncHistory? }?): void
router.prefetch(href, { mode?, signal?, force? }?): Promise<void>
```

`navigate()` accepts a string path and uses history push by default. Set `replace: true` to replace the current entry, or `syncHistory: false` when another integration owns the address bar. Navigation continues asynchronously; observe its outcome through hooks or DOM events.

`prefetch()` prepares a route without changing the current URL. It returns when the prefetch work settles; see [Prefetch](./06-navigation-ux.md#prefetch) for modes and safeguards.

### Invalidate, refresh, and fallback

```ts
router.invalidate({ cache?, key?, path?, match?, policy? }?): number
router.refreshRoutes(): void
router.setNotFoundHandler(handler | null): void
```

`invalidate()` returns the number of affected entries and defaults to the data cache with the stale policy. Its optional `match` field is a cache-key predicate; prefer `path` for normal route-level invalidation.

`refreshRoutes()` rebuilds matching from all descendant `<aura-route>` elements after route markup is added, removed, or reordered.

`setNotFoundHandler()` sets an instance-level fallback; pass `null` to clear it. See [Custom 404 handling](./07-errors-and-accessibility.md#custom-404-handling) for precedence.

### Read runtime state

```ts
router.activeRouteBranch; // readonly root → leaf entries
router.routes; // all descendant AuraRoute elements
router.appOutlet; // resolved root AuraOutlet
```

`RouterInstance` intentionally describes only the minimal `navigate` API available in hook context. When accessing the methods or getters of an `<aura-router>` element directly, type or narrow it as `AuraRouter`.

### Change route markup

Most applications should keep route definitions in HTML. When code changes a cached route attribute after connection, refresh the route before rebuilding the route tree:

```ts
route.setAttribute('guard', 'admin');
route.refresh();
router.refreshRoutes();
```

`route.validateAttrs()` throws for invalid page, folder, or redirect combinations.

Useful read-only state includes `uid`, `type`, `hasChildrenRoutes`, `hasLayout`, `hasViewContent`, and `nestedOutlet`. Other public-looking mount and lifecycle methods implement the internal engine contract and are not application APIs.

### DOM events

> **0.x note.** DOM event names and detail payloads may evolve before `1.0.0`.

Import event constants and their matching event/detail types from `@auraui/router` instead of repeating strings.

| Event                    | Key semantics                                                   |
| ------------------------ | --------------------------------------------------------------- |
| `navigation-start`       | URL aligned; includes `from`, `to`, and `pathname`              |
| `navigation`             | View commit succeeded                                           |
| `navigation-complete`    | Terminal success with transaction `id`                          |
| `navigation-cancel`      | Cancelled or superseded; optional `reason`                      |
| `navigation-redirect`    | Terminal redirect observation with `url` and `replace`          |
| `load-start`, `load-end` | Per entering route; `id`, `nodeId`, `pattern`                   |
| `load-error`             | Load fields plus `error`                                        |
| `navigation-error`       | `error`, `href`, `from`, `to`, `phase`, `code`, `viewCommitted` |
| `navigation-hook-error`  | An error hook failed; includes the parent failure               |
| `not-found`              | `url` and `source`; fallback form is cancelable                 |
| `data-invalidated`       | Number of affected cache entries                                |

Import event names through their exported `AURA_ROUTER_…` constants instead of repeating string literals. The package also provides matching `AuraRouter…Event` and `AuraRouter…EventDetail` types.

Related public types include `NotFoundHandler`, `NotFoundSource`, `LoaderFn`, `RouteHookFn`, `RouteLoadFn`, `RouteHookDefinition`, `NavigationErrorPhase`, and `NavigationFailureCode`.

## Compatibility and related links

Aura Router targets modern evergreen browsers with ES modules, Custom Elements, History API, and `fetch`. Dynamic `:param` patterns depend on `URLPattern`; provide a polyfill before installing Aura on browsers that lack it. There is no IE support and no Node SSR runtime.

The package is HTML-first and has no React or Vue adapter. Custom elements and Lit components can still be used inside views.

- [README](../../README.md) – quick start and project links
- [Recipes](../recipes/README.md) – auth, nested routes, cache, 404, and first paint
- [Known limitations](../../LIMITATIONS.md)
- [Security policy](../../SECURITY.md)
- [Roadmap](../../ROADMAP.md)
- [Changelog](../../CHANGELOG.md)

---

[← Errors and accessibility](./07-errors-and-accessibility.md) · [Guide index](../guide.md)

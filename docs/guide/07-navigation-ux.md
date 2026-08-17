# Chapter 7 — Navigation experience

Control scrolling, prefetching, caching, and loading feedback.

[← First paint: MPA → SPA](./06-mpa-to-spa.md) · [Guide index](../guide.md) · [Errors and accessibility →](./08-errors-and-accessibility.md)

---

## Scroll

After navigation commits, three attributes control scrolling:

- `scroll` decides whether Aura scrolls or restores a saved position;
- `scroll-target` selects an element to reveal instead of using the top of the page;
- `scroll-behavior` controls the animation.

All three inherit from `<aura-router>` and parent routes. A child route can override them.

### Scroll policy

| Value           | Behaviour                                                               |
| --------------- | ----------------------------------------------------------------------- |
| `scroll="auto"` | Default – use the top or target when moving forward; restore on history |
| `scroll="top"`  | Always use the top or target, including back and forward navigation     |
| `scroll="none"` | Leave the current scroll position unchanged                             |

`scroll="off"` and `scroll="false"` also disable scrolling.

### Target and animation

Set `scroll-target` to a CSS selector when navigation should reveal a specific element:

```html
<aura-route
  path="/docs"
  scroll-target="#main"
  scroll-behavior="smooth"
></aura-route>
```

Aura calls `scrollIntoView()` when the selector matches. An invalid selector or missing element falls back to the top of the page. Use `scroll-target="none"`, `off`, or `false` to disable an inherited target.

`scroll-behavior` accepts `auto`, `smooth`, or `instant`. The default is `auto`, which uses the browser's native behaviour.

### History, hashes, and reduced motion

With `scroll="auto"`, Aura saves positions and restores them during back and forward navigation. A restored position takes priority over `scroll-target`.

A URL hash scrolls directly to its matching element. Hash scrolling ignores `scroll` and `scroll-target`, but still uses `scroll-behavior`.

When the user prefers reduced motion, Aura changes `smooth` to `instant`.

## Prefetch

> **0.x note.** Prefetch policies may evolve before `1.0.0`.

Prefetch starts route work before navigation. `intent` can prepare load data while the user considers a link; stronger signals such as `tap` and `manual` also prepare the view payload.

### Prefetch modes

| Mode                   | Behaviour                                                  |
| ---------------------- | ---------------------------------------------------------- |
| `intent`               | Start after pointer or keyboard focus indicates interest   |
| `tap`                  | Start on touch or pointer down, just before navigation     |
| `manual`               | Start only through `router.prefetch()`                     |
| `viewport`, `render`   | Recognised, but automatic DOM triggers are not implemented |
| `false`, `off`, `none` | Disable prefetching at the current cascade level           |

The default mode is `intent`. On touch devices, Aura uses `tap` when the link or matched route does not provide another policy.

### Policy cascade

Aura uses the first applicable setting in this order:

**link `data-prefetch` → matched route `prefetch` → router `prefetch` → default `intent`**

Route-level `prefetch` inherits through parent routes. Use a child route or link override when one destination needs a different policy:

```html
<aura-router prefetch="intent">
  <aura-route path="/docs" prefetch="tap" view="docs.html"></aura-route>
</aura-router>

<a href="/docs" aura-router-link data-prefetch="false">Docs</a>
```

An absent `prefetch` attribute does not disable the feature; Aura falls back to `intent`. Set `prefetch="false"`, `off`, or `none` explicitly to opt out.

### Manual prefetch

Call `router.prefetch()` when application logic knows which route is likely to be opened:

```ts
await router.prefetch('/users/42', {
  mode: 'manual',
  force: true,
});
```

`manual` is the API default. `force: true` bypasses save-data, hash-only, and freshness checks, and restarts matching in-flight work.

### Safeguards

Prefetch ignores external or unsuitable URLs and unmatched routes. Unless forced, it also skips hash-only changes, recent duplicate work, and connections with data saving enabled.

Prefetch follows declarative redirects, but it does not run navigation guards, change the current URL, or show loading UI.

## Cache

Caching avoids repeating work when a user returns to a route. Aura can retain three different layers:

- **DOM** – the detached, already-rendered view;
- **view payload** – the string returned by the view loader;
- **load data** – values returned by `load` hooks.

### Cache layers

| Value                  | DOM | View payload | Load data |
| ---------------------- | :-: | :----------: | :-------: |
| `cache`                |     |      ✓       |     ✓     |
| `view`                 |     |      ✓       |           |
| `data`                 |     |              |     ✓     |
| `dom`                  |  ✓  |      ✓       |           |
| `all`                  |  ✓  |      ✓       |     ✓     |
| `off`, `none`, `false` |     |              |           |

The bare `cache` attribute keeps view payloads and load data, but not rendered DOM. `cache="dom"` also keeps the view payload as a fallback.

Use `cache="dom"` when live UI state, such as an unfinished form, should survive navigation. It retains component instances and event listeners, so use it selectively.

```html
<aura-route path="/feed" view="feed.html" load="feed" cache></aura-route>
<aura-route path="/editor" view="editor.html" cache="dom"></aura-route>
```

`cache` inherits through parent routes. Use `cache="off"`, `none`, or `false` to disable inherited caching for a branch. An unknown mode disables caching and logs a warning.

### Lifetime and identity

`cache-time` sets the inherited lifetime, in seconds, of retained view and data entries. It has no effect on layers that the selected cache mode does not keep.

`cache-refresh` is also accepted and inherited, but it does not currently trigger stale-while-revalidate during navigation. Treat it as reserved until that path is connected.

Cache keys include the pathname, route parameters, and complete query string. Different query strings therefore produce different entries.

Prefetch can pass in-flight work to navigation through a short handoff buffer of about 30 seconds. This temporary handoff also works when durable caching is disabled.

### Invalidate cached entries

Use `router.invalidate()` when cached data should no longer be reused:

```ts
router.invalidate(); // load data
router.invalidate({ cache: 'view' }); // view payloads
router.invalidate({ cache: 'all' }); // data + view
router.invalidate({ path: '/users/:id' }); // route pattern
router.invalidate({ key: 'data:/users/:id|id=42' }); // exact cache key
router.invalidate({ path: '/items', policy: 'remove' });
```

The default policy marks matching entries as stale. `policy: 'remove'` deletes them immediately.

Invalidation does not remount the current page or clear detached `cache="dom"` views. It emits `data-invalidated` except when only view payloads are invalidated.

You can target entries by exact `key`, route-pattern `path`, or a custom `match` predicate. When several scopes are provided, Aura uses `key` first, then `path`, then `match`. A `path` is the route pattern, not the current browser pathname.

## Loading

Aura activates loading UI after guards allow navigation and keeps it active while the view and route data are prepared. The previously committed page remains available during this work.

### Loading options

| Attribute             | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `loading-body-class`  | Add a class to `document.body` while loading              |
| `loading-start-event` | Dispatch a start event; default `aura-route-loading`      |
| `loading-end-event`   | Dispatch an end event; default `aura-route-loading-end`   |
| `loading-template`    | Stage a template in the outlet until preparation finishes |

These attributes inherit through parent routes. Use `none`, `off`, or `false` to disable an inherited option.

For most applications, prefer the body class or events: they can show a progress indicator without replacing the current page.

### Outlet skeleton

> **Experimental.** `loading-template` may be removed in a future release. A staged skeleton can disrupt visual continuity and harm UX, especially during short navigations. Prefer `loading-body-class` or loading events for production UI.

Use `loading-template` when the destination outlet should display a skeleton. Its value is a `<template>` id:

```html
<aura-outlet></aura-outlet>
<aura-router loading-body-class="is-loading">
  <aura-route
    path="/contacts"
    view="contacts.html"
    loading-template="loading"
  ></aura-route>
</aura-router>

<template id="loading"><p>Loading…</p></template>
```

Aura stages the skeleton without immediately discarding the committed view. When preparation finishes, the destination replaces it.

### Special cases

| Situation                    | Behaviour                                                |
| ---------------------------- | -------------------------------------------------------- |
| A page transition is active  | Skip `loading-template`; body class and events still run |
| Navigation is cancelled      | Remove the skeleton and keep the committed view          |
| Work starts through prefetch | Do not activate loading UI                               |

---

[← First paint: MPA → SPA](./06-mpa-to-spa.md) · [Guide index](../guide.md) · [Errors and accessibility →](./08-errors-and-accessibility.md)

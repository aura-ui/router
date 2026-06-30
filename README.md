# Aura UI Router

Declarative nested routing in HTML — MPA→SPA without React, with data-router-style lifecycle.

SSR-first router for **Aura UI** — Web Components platform: predictable hooks and seamless SPA transitions after hydration.

```bash
npm install @aura-ui-web/router
```

## Links

| Layer | Name |
| --- | --- |
| npm scope | `@aura-ui-web/*` |
| GitHub | [github.com/aura-ui/router](https://github.com/aura-ui/router) |

### What `web` means in `@aura-ui-web`

In the `@aura-ui-web` npm scope, **`web` stands for Web Components** — the first word of the technology we target (`Web Components`), not a generic “web app” label and not a development/pre-release channel.

```
Web Components  →  web  →  @aura-ui-web/router
```

Example packages:

```
@aura-ui-web/router
@aura-ui-web/base
@aura-ui-web/components   (planned)
```

## `<aura-route>` attributes

Register hook implementations with `AuraRouter.use(hook)`. Attributes on the route pick **when** hooks run (comma-separated names).

### Route

| Attribute | Description |
| --- | --- |
| `path` | URL pattern (required) |
| `view` | What to show: `ref` (default `url`) or `loader::ref` for other loaders |
| `layout` | Nested shell — parent route with `<template id="…">`, children render in its outlet |
| `preserve` | Keep on leave: `preserve` or `preserve="view"` (DOM), `preserve="data"` (load cache), `preserve="all"` |

### `view` loaders

Format: bare **`ref`** defaults to **`url`** loader. Prefix `loader::` only for non-default loaders (`html`, `template`, `component`, `import`, `iframe`).

| Loader | `ref` | Description |
| --- | --- | --- |
| `url` | `.html` path | Fetch **HTML** from server |
| `html` | markup | Inline HTML in the attribute |
| `template` | template id | Clone from `<template id="…">` |
| `component` | tag name | Mount a registered custom element |
| `import` | module path | Dynamic `import()` and register the component |
| `iframe` | URL | Embed external page in `<iframe>` |

**`url` and fragment selector** — one loader for partials and legacy full pages:

| `ref` | Behavior |
| --- | --- |
| `users.html` | Server returns a partial — inject as-is |
| `legacy/about.html::#main` | Full HTML page — extract fragment (`path::` + any CSS selector) |

```html
<aura-route path="/users" view="users.html" />
<aura-route path="/about" view="legacy/about.html::#main" />
<aura-route path="/app" view="import::./pages/app.ts" />
<aura-route path="/embed" view="iframe::https://example.com/widget" />
```

Use `import` for `.js` / `.ts`, not bare `url` ref.

Parsing: if the token before the first `::` is a **known loader** (`html`, `template`, `component`, …) → `loader::ref`. Otherwise the whole value is a **`url` ref** (may contain `path.html::selector` for extract).

Custom loaders: `AuraRouter.registerLoader(type, fn)`.

### Lifecycle

| Attribute | When | Blocking |
| --- | --- | --- |
| `leave` | Before leaving the route | yes |
| `guard` | Before entering the route (auth, redirect) | yes |
| `load` | Fetch data before render | yes |
| `ready` | After view is committed (analytics, focus) | no |
| `unmount` | Exit cleanup after commit | no |
| `update` | Same route, query/hash change (shortcut) | no |
| `error` | Navigation or render failure | terminal |

With `preserve` on the route, optional teardown hooks: `detach`, `destroy` (on leave) and `restore` (reattach from view cache on enter).

### Presentation

| Attribute | Description |
| --- | --- |
| `transition-in` | Enter animation hooks |
| `transition-out` | Exit animation hooks |
| `transition-order` | `out-in`, `in-out`, or `parallel` |
| `transition` | Shortcut for symmetric in/out hooks |

### Inherited from `<aura-router>` (override per route)

| Attribute | Description |
| --- | --- |
| `scroll` | `restore`, `top`, or `manual` |
| `prefetch` | Link prefetch policy |
| `loading-template` | Template id while view loads |
| `error-template` | Template id on render error |

Empty value (`guard=""`) opts out of an inherited router default.

### Example

```html
<aura-router guard="auth" ready="analytics" scroll="restore">
  <aura-route path="/users" layout="users-shell">
    <aura-route
      path=":id"
      view="users.html"
      load="fetch-user"
      ready="track-view"
    />
  </aura-route>
  <aura-route
    path="/settings"
    view="component::settings-page"
    leave="confirm-unsaved"
    preserve
  />
</aura-router>
```
## License & brand

MIT covers source code only — not the project name or logos. See [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

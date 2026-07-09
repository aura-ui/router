# Aura UI Router

[![npm version](https://img.shields.io/npm/v/@aura-ui-web/router.svg)](https://www.npmjs.com/package/@aura-ui-web/router)
[![license](https://img.shields.io/npm/l/@aura-ui-web/router.svg)](./LICENSE)

**Declarative routing for Web Components — SSR-first, from static HTML to client navigation.**

Composable lifecycle hooks and nested routes, declared in markup.

```bash
npm install @aura-ui-web/router
```

> **Target API.** This README describes the public lifecycle attribute names. Other areas may still lag — see [ROADMAP](./ROADMAP.md).

---

## Table of contents

- [Why Aura Router](#why-aura-router)
- [Quick start](#quick-start)
- [Navigation](#navigation)
- [Views](#views)
- [Nested routes & layouts](#nested-routes--layouts)
- [Lifecycle hooks](#lifecycle-hooks)
- [Router defaults](#router-defaults)
- [Programmatic API](#programmatic-api)
- [Custom loaders](#custom-loaders)
- [Package scope](#package-scope)
- [Development](#development)
- [Documentation](#documentation)
- [License](#license)

---

## Why Aura Router

| | |
| --- | --- |
| **No framework lock-in** | Plain HTML + Web Components — works with Lit, vanilla CE, or legacy pages |
| **MPA → SPA** | Server-rendered `.html` partials, then client-side navigation after hydration |
| **Progressive enhancement** | Routes live in HTML; plain links work without JS — `data-router-link` upgrades them to SPA navigation |
| **Legacy-friendly** | One `url` loader for partials and full pages — fragment extract via `extract` attr |
| **Predictable lifecycle** | Composable hooks (`AuraRouter.use()` + HTML attributes) — guards, load, ready; same mental model as Vue Router / TanStack Router |

---

## Quick start

**1. Declare routes in HTML**

```html
<aura-outlet></aura-outlet>

<aura-router>
  <aura-route path="/" view="html::<h1>Home</h1>"></aura-route>
  <aura-route path="/users" view="users.html"></aura-route>
  <aura-route path="*" view="template::404-template"></aura-route>
</aura-router>

<template id="404-template">
  <h1>404</h1>
  <p>URL: <span data-not-found-url></span></p>
</template>
```

A bare `view` value (e.g. `users.html`) defaults to the **`url`** loader — it fetches HTML from the server.

**2. Bootstrap the router**

```ts
import { AuraRouter } from '@aura-ui-web/router';

AuraRouter.install();
```

**3. Add in-app links**

```html
<a href="/users" data-router-link>Users</a>
```

Clicks on `[data-router-link]` are intercepted; the URL updates and the matching route renders into `<aura-outlet>`.

> **Demo:** clone the repo and run `npm run dev` — open the Vite dev server to try loaders, nested routes, transitions, and prefetch.

---

## Navigation

| Mechanism | Usage |
| --- | --- |
| **Link interception** | `data-router-link` on `<a href="…">` — see `links-selector` under [Router defaults](#router-defaults) |
| **Programmatic** | `router.navigate('/path', { replace?: boolean })` |
| **404 catch-all** | `<aura-route path="*" view="template::404-template">` |
| **Fallback 404** | `not-found-template` on `<aura-router>` — see [Router defaults](#router-defaults) |

---

## Views

The `view` attribute tells the router **what to render**.

Format: bare **`content`** defaults to **`url`** loader. Prefix `loader::` only for non-default loaders (`html`, `template`, `component`, `import`, `iframe`).

### Built-in loaders

| Loader | `content` | Description |
| --- | --- | --- |
| `url` | `.html` path | Fetch **HTML** from server |
| `html` | markup | Inline HTML in the attribute |
| `template` | template id | Clone from `<template id="…">` |
| `component` | tag name | Mount a registered custom element |
| `import` | module path | Dynamic `import()` and register the component |
| `iframe` | URL | Embed external page in `<iframe>` |

### `url` loader

| `view` content | Behavior |
| --- | --- |
| `users.html` | Server returns a partial — inject as-is |
| `legacy/about.html` | Fetches HTML; inject as-is unless `extract` is set (see below) |

```html
<aura-route path="/users" view="users.html" />
<aura-route path="/app" view="import::./pages/app.ts" />
<aura-route path="/embed" view="iframe::https://example.com/widget" />
```

Use `import` for `.js` / `.ts`, not bare `url` content.

**Parsing:** token before the first `::` is a **known loader** (`html`, `template`, `component`, …) → `loader::content`. Otherwise → **custom loader** (`markdown::doc.md`). Bare content (no `::`) → default **`url`** loader.

### `extract` — fragment from full HTML pages

For MPA→SPA migration: legacy server pages are often full HTML documents. Set a **CSS selector** to extract the main content instead of injecting the whole response.

| Attribute | Description |
| --- | --- |
| `extract` | CSS selector (e.g. `#main`, `.content`). Empty / omitted → partial as-is. **Inherits** from `<aura-router>` and parent `<aura-route>` (opt-out with `extract=""`). |

```html
<!-- One selector for a whole legacy branch -->
<aura-router extract="#main">
  <aura-route path="/about"   view="legacy/about.html" />
  <aura-route path="/contact" view="legacy/contact.html" />
</aura-router>

<!-- Override on a single route -->
<aura-route path="/special" view="pages/special.html" extract="#article" />
```

> **Status:** documented target API — loader wiring not implemented yet.

See [Custom loaders](#custom-loaders) to register your own loader types.

---

## Nested routes & layouts

Nest `<aura-route>` elements to build a route tree. A parent with `layout` renders a shell; children render into its `<aura-outlet>`.

```html
<template id="users-shell">
  <nav>Users section</nav>
  <aura-outlet></aura-outlet>
</template>

<aura-router>
  <aura-route path="/users" layout="users-shell">
    <aura-route path="." view="users/index.html" />
    <aura-route path=":id" view="users/detail.html" load="fetch-user" />
  </aura-route>
</aura-router>
```

| Attribute | Description |
| --- | --- |
| `path` | URL pattern (required) |
| `view` | What to show: bare content (default `url`) or `loader::content` for other loaders |
| `extract` | CSS selector to extract a fragment from a full HTML page; inherits from router/parent |
| `layout` | Nested shell — parent route with `<template id="…">`, children render in its outlet |
| `preserve` | Keep on leave: `preserve` or `preserve="view"` (DOM), `preserve="data"` (load cache), `preserve="all"` |

Hooks on a parent run for every child navigation inside that branch (with inheritance — see [Router defaults](#router-defaults)).

---

## Lifecycle hooks

Register hook implementations with `AuraRouter.use(hook)`. Phase attributes (`guard`, `load`, `ready`, …) list **hook names** to run at that phase — comma-separated.

```ts
import { defineRouteHook, AuraRouter } from '@aura-ui-web/router';

const authHook = defineRouteHook({
  name: 'auth',
  version: '1.0.0',
  fn: async (ctx) => {
    if (!isLoggedIn()) return '/login'; // redirect URL cancels navigation
  },
});

AuraRouter.use(authHook);
```

`guard="auth"` runs the hook named `auth` during the guard phase. Attributes inherit from `<aura-router>` down the tree. Empty value (`guard=""`) opts out of an inherited default.

### Lifecycle

| Attribute | When | Blocking |
| --- | --- | --- |
| `leave` | Before leaving the route | yes |
| `guard` | Before entering the route (auth, redirect) | yes |
| `load` | Fetch data before render | yes |
| `ready` | After view is committed (analytics, focus) | no |
| `unmount` | Exit cleanup after commit | no |
| `update` | Same route leaf; query, hash or params may change (shortcut) | no |
| `error` | Navigation or render failure | terminal |

With `preserve` on the route, optional teardown hooks: `detach`, `destroy` (on leave) and `restore` (reattach from view cache on enter).

### Presentation

| Attribute | Description |
| --- | --- |
| `transition-in` | Enter animation hooks |
| `transition-out` | Exit animation hooks |
| `transition-order` | `out-in`, `in-out`, or `parallel` |
| `transition` | Shortcut for symmetric in/out hooks |

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

> Deep dive: [docs/HOOKS.md](./docs/HOOKS.md) · [docs/NAVIGATION_MODEL.md](./docs/NAVIGATION_MODEL.md) · [docs/todo/LIFECYCLE_PHASE_NAMING.md](./docs/todo/LIFECYCLE_PHASE_NAMING.md)

---

## Router defaults

Attributes on `<aura-router>` inherit to child routes (override per route or per link):

| Attribute | Description |
| --- | --- |
| `scroll` | `restore`, `top`, or `manual` |
| `prefetch` | `intent`, `viewport`, `tap`, `render`, `manual`, or `false` / `none` (off) |
| `loading-template` | Template id while view loads |
| `error-template` | Template id on render error |
| `links-selector` | CSS selector for in-app links (default: `[data-router-link]`) |
| `not-found-template` | Template id for fallback 404 when no `path="*"` route exists |
| `extract` | Default CSS selector for `url` fragment extract on legacy full pages |

**Prefetch cascade:** `data-prefetch` on the link → `prefetch` on `<aura-route>` → `prefetch` on `<aura-router>`.

```html
<aura-router prefetch="intent" scroll="restore" loading-template="loading">
  …
</aura-router>

<a href="/heavy" data-router-link data-prefetch="tap">Load on tap</a>
```

---

## Programmatic API

```ts
import { AuraRouter } from '@aura-ui-web/router';

// Register global hooks
AuraRouter.use(myHook, { /* hook options */ });

// Global config
AuraRouter.configure({
  notFoundHandler: (url) => { /* … */ },
  dataCache: { max: 50 },
  viewCache: { max: 10 },
});

// Register a custom view loader
AuraRouter.registerLoader('custom', myLoaderFn);

// Mount custom elements
AuraRouter.install();

// Instance methods
const router = document.querySelector('aura-router');
router.navigate('/users', { replace: true });
router.refreshRoutes();
```

### Events

```ts
router.addEventListener('not-found', (e) => {
  const { url, source } = e.detail; // source: 'route' | 'fallback'
});

router.addEventListener('navigation-error', (e) => {
  const { error, code, phase } = e.detail;
});

router.addEventListener('navigation-hook-error', (e) => {
  const { error, parent } = e.detail;
});
```

---

## Custom loaders

```ts
import { AuraRouter, type LoaderFn } from '@aura-ui-web/router';

const myLoader: LoaderFn = async (ctx) => {
  const text = await fetch(ctx.content, { signal: ctx.signal }).then((r) => r.text());
  return text; // HTML string injected into the outlet
};

AuraRouter.registerLoader('custom', myLoader);
```

```html
<aura-route path="/custom" view="custom::partial.html" />
```

---

## Package scope

Aura UI packages are published under **`@aura-ui-web/*`**.

In this scope, **`web` means Web Components** — the technology we target — not a generic “web app” label or a pre-release channel.

```
Web Components  →  web  →  @aura-ui-web/router
```

| Package | Status |
| --- | --- |
| `@aura-ui-web/router` | this repo |
| `@aura-ui-web/base` | planned |
| `@aura-ui-web/components` | planned |

| | |
| --- | --- |
| **npm** | `@aura-ui-web/*` |
| **GitHub** | [github.com/aura-ui/router](https://github.com/aura-ui/router) |

---

## Development

```bash
git clone https://github.com/aura-ui/router.git
cd router
npm install
npm run dev      # Vite demo at localhost
npm test         # Jest
npm run check    # lint + build
```

Commit messages follow [Conventional Commits](./CONTRIBUTING.md).

---

## Documentation

| Topic | Doc |
| --- | --- |
| Architecture | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| Hook contract & glossary | [docs/HOOKS.md](./docs/HOOKS.md) |
| Navigation model | [docs/NAVIGATION_MODEL.md](./docs/NAVIGATION_MODEL.md) |
| Nested routes | [docs/NESTED_ROUTES.md](./docs/NESTED_ROUTES.md) |
| Prefetch | [docs/PREFETCH_ARCHITECTURE.md](./docs/PREFETCH_ARCHITECTURE.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) |
| Module: `<aura-router>` | [src/modules/aura-router/README.md](./src/modules/aura-router/README.md) |

---

## License

MIT covers source code only — not the project name or logos. See [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

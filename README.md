# Aura UI Router

[![npm version](https://img.shields.io/npm/v/@auraui/router.svg)](https://www.npmjs.com/package/@auraui/router)
[![license](https://img.shields.io/npm/l/@auraui/router.svg)](./LICENSE)

**Declarative routing for Web Components — SSR-first, from static HTML to client navigation.**

Composable lifecycle hooks and nested routes, declared in markup.

```bash
npm install @auraui/router
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
import { AuraRouter } from '@auraui/router';

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

### How `href` resolves

The **`href` attribute is the source of truth** — for crawlers, noscript, and the router. On click, Aura resolves links the same way the browser does: `new URL(href, location.href)`.

| Link in markup | Current URL | Resolves to |
| --- | --- | --- |
| `href="/users"` | any | `/users` |
| `href="profile"` | `/app/settings/` | `/app/settings/profile` |
| `href="."` | `/app/settings/profile` | `/app/settings/` |

Use **path-relative** `href` inside layout templates; use **absolute** `/…` paths when leaving a branch. Legacy absolute links keep working — only navigation is intercepted.

### Route `path` vs address bar

These are separate:

| | Route `path` attr | Browser URL (canonical) |
| --- | --- | --- |
| **Folder** | `/app/settings` — trailing `/` optional, normalized away | index → `/app/settings/` |
| **Index child** | `path="."` | same as folder URL |
| **Leaf** | `profile` → `/app/settings/profile` | `/app/settings/profile` — no trailing slash |

`path="/app/settings"` and `path="/app/settings/"` build the **same route tree**. Folder = `layout` + children, not a slash in `path`.

On index navigation, the engine **canonicalizes** the address bar (`/app/settings` → `/app/settings/` via `replaceState`) so path-relative links in the layout resolve correctly. Leaf routes are never given a trailing slash.

```html
<aura-route path="/app/settings" layout="settings-frame">
  <template id="settings-frame">
    <nav>
      <a href="profile" data-router-link>Profile</a>
      <a href="." data-router-link>Overview</a>
    </nav>
    <aura-outlet></aura-outlet>
  </template>
  <aura-route path="." view="overview.html" />
  <aura-route path="profile" view="profile.html" />
</aura-route>
```

> Deep dive: [docs/NAVIGATION_MODEL.md](./docs/NAVIGATION_MODEL.md) · [docs/NESTED_ROUTES.md](./docs/NESTED_ROUTES.md)

---

## Views

The `view` attribute tells the router **what to render**.

**Syntax:** `view="content"` or `view="loader::content"`.

- **No `::`** — shorthand for fetching HTML: `view="users.html"` → `url` loader, content `users.html`.
- **With `::`** — pick a loader explicitly: `html::<p/>`, `template::app-shell`, `import::./app.ts`, or any [custom loader](#custom-loaders).

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

**Parsing:** if the value contains `::`, the part before it is the loader id and the rest is `content`. Unknown loader ids (e.g. `markdown::doc.md`) work once registered. No `::` → `url` loader.

### `extract` — fragment from full HTML pages

For MPA→SPA migration: legacy server pages are often full HTML documents. Set a **CSS selector** to extract the main content instead of injecting the whole response.

| Attribute | Description |
| --- | --- |
| `extract` | CSS selector (e.g. `#main`, `.content`). Omitted → partial as-is. **Inherits** from `<aura-router>` / parent `<aura-route>`; opt out with `extract="none"` (or `off` / `false`). |

```html
<!-- One selector for a whole legacy branch -->
<aura-router extract="#main">
  <aura-route path="/about"   view="legacy/about.html" />
  <aura-route path="/contact" view="legacy/contact.html" />
</aura-router>

<!-- Override on a single route -->
<aura-route path="/special" view="pages/special.html" extract="#article" />
```

See [Custom loaders](#custom-loaders) to register your own loader types.

---

## Nested routes & layouts

Nest `<aura-route>` elements to build a route tree. A parent with `layout` renders a shell; children render into its `<aura-outlet>`. Path-relative links in the shell (`href="profile"`) — see [Navigation](#navigation).

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
| `view` | What to render: `page.html` (→ `url`) or `loader::content` (e.g. `html::…`, `import::…`) |
| `extract` | CSS selector to extract a fragment from a full HTML page; inherits from router/parent |
| `layout` | Nested shell — parent route with `<template id="…">`, children render in its outlet |
| `cache` | Keep on leave: `dom`, `view`, `data`, `screen` (dom + view), `all`; `none` / `off` / `false` opts out of inherited cache. See [docs/PRESERVE.md](./docs/PRESERVE.md). |

Hooks on a parent run for every child navigation inside that branch (with inheritance — see [Router defaults](#router-defaults)).

---

## Lifecycle hooks

Register hook implementations with `AuraRouter.use(hook)`. Phase attributes (`guard`, `load`, `ready`, …) list **hook names** to run at that phase — comma-separated.

```ts
import { defineRouteHook, AuraRouter } from '@auraui/router';

const authHook = defineRouteHook({
  name: 'auth',
  version: '1.0.0',
  fn: async (ctx) => {
    if (!isLoggedIn()) return '/login'; // redirect URL cancels navigation
  },
});

AuraRouter.use(authHook);
```

`guard="auth"` runs the hook named `auth` during the guard phase. Many attributes **inherit** from `<aura-router>` and parent `<aura-route>` down the tree.

**Override** with your own value (`guard="admin-only"`). **Opt out** of inheritance with `none`, `off`, or `false` — e.g. `guard="none"`, `scroll="none"`, `cache="off"`, `loading-template="none"`. Same rule for all inheritable attrs; empty `attr=""` is not supported.

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

With `cache="dom"` or `cache="screen"` on the route, optional teardown hooks: `detach`, `destroy` (on leave) and `restore` (reattach from view cache on enter).

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
  <aura-route path="/login" view="login.html" guard="none" />
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
    cache="screen"
  />
</aura-router>
```

> Deep dive: [docs/HOOKS.md](./docs/HOOKS.md) · [docs/NAVIGATION_MODEL.md](./docs/NAVIGATION_MODEL.md) · [docs/todo/LIFECYCLE_PHASE_NAMING.md](./docs/todo/LIFECYCLE_PHASE_NAMING.md)

---

## Router defaults

Attributes on `<aura-router>` inherit to child `<aura-route>` elements. Per-route override: set a value. Opt out on a child: `none`, `off`, or `false` on that attribute.

| Attribute | Description |
| --- | --- |
| `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error` | Global hook lists (comma-separated names) |
| `scroll` | `restore`, `top`, or `manual` (`scroll="none"` on child → `manual`) |
| `prefetch` | `intent`, `viewport`, `tap`, `render`, `manual`, or `false` / `none` / `off` |
| `cache` | `dom`, `view`, `data`, `screen`, `all` — child `cache="off"` opts out |
| `loading-template` | Template id while view loads (`loading-template="none"` opts out) |
| `error-template` | Template id on render error |
| `extract` | Default CSS selector for `url` fragment extract |
| `links-selector` | CSS selector for in-app links (default: `[data-router-link]`) |
| `not-found-template` | Template id for fallback 404 when no `path="*"` route exists |

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
import { AuraRouter } from '@auraui/router';

// Register global hooks
AuraRouter.use(myHook, { /* hook options */ });

// Global config — aligns with route `cache` attr: dom / view / data
AuraRouter.configure({
  notFoundHandler: (url) => { /* … */ },
  domCache: { max: 10 },
  viewCache: { max: 50 },
  dataCache: { max: 50, staleTime: 30_000 },
});

// Configure keys match route `cache` attr layers:
// domCache → cache.dom, viewCache → cache.view, dataCache → cache.data

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
import { AuraRouter, type LoaderFn } from '@auraui/router';

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

Aura UI packages are published under **`@auraui/*`**.

Custom element tags use the short prefix **`aura-*`** (for example `<aura-router>`, `<aura-route>`, `<aura-outlet>`).

| Package | Status |
| --- | --- |
| `@auraui/router` | this repo |
| `@auraui/base` | planned |
| `@auraui/components` | planned |

| | |
| --- | --- |
| **npm** | [`@auraui/router`](https://www.npmjs.com/package/@auraui/router) · scope `@auraui/*` |
| **Site** | [auraui.dev](https://auraui.dev) |
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

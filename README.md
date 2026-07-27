# Aura Router

[![npm version](https://img.shields.io/npm/v/@auraui/router.svg)](https://www.npmjs.com/package/@auraui/router)
[![license](https://img.shields.io/npm/l/@auraui/router.svg)](./LICENSE)

**Declarative routing for Web Components — HTML-first, MPA→SPA.**

First visit shows a normal HTML page. After `AuraRouter.install()`, in-app links update the page content without a full reload (SPA-style).

```bash
npm install @auraui/router
```

> **Experimental (pre-alpha).** `@auraui/router@0.0.1` may change before `0.1.0`. Pin exact versions; use for evaluation and feedback, not as a frozen production contract yet. Lifecycle attribute names in this README (`guard`, `load`, `ready`, …) are the intended public surface — see [ROADMAP](./ROADMAP.md) and [LIMITATIONS](./LIMITATIONS.md) for gaps and in-flight work.

---

## Table of contents

- [Why Aura Router](#why-aura-router)
- [Quick start](#quick-start)
- [Navigation](#navigation)
- [Views](#views)
- [Nested routes & layouts](#nested-routes--layouts)
- [Lifecycle hooks](#lifecycle-hooks)
- [Cache](#cache)
- [Loading](#loading)
- [Router defaults](#router-defaults)
- [Programmatic API](#programmatic-api)
- [More](#more)
- [License](#license)

---

## Why Aura Router

Built for sites that stay HTML on the server and add client navigation in the browser: routes in markup; your UI can be plain HTML or Web Components.

| | |
| --- | --- |
| **Routes in HTML** | Declare `<aura-router>`, `<aura-route>`, `layout`, and `view` in markup instead of owning the app from a JS route table |
| **HTML-first, MPA → SPA** | Each URL is a full HTML page (router included). The first visit paints that document; later in-app navigations fetch HTML and update the outlet |
| **SEO-friendly** | Search engines and link previews can read real HTML when your server renders the page — no empty client shell required |
| **Web Components, no lock-in** | Works with vanilla custom elements, Lit, or existing HTML pages |
| **Nested layouts & lifecycle** | Nested outlets plus `guard`, `load`, `ready`, and cache — declared on the route |
| **Progressive enhancement** | Plain `href` links keep working without JavaScript; `aura-router-link` upgrades them to client navigation |
| **Legacy-friendly** | Load full server pages with the `url` view and take a fragment via `extract` |

---

## Quick start

**1. Install once**

```ts
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

This registers the custom elements: `<aura-router>`, `<aura-route>`, and `<aura-outlet>` (the place where page content appears).

**2. Declare routes in HTML**

```html
<aura-router>
  <aura-route path="/" view="index.html"></aura-route>
  <aura-route path="/users" view="users.html"></aura-route>
  <aura-route path="/about" view="template::about-page"></aura-route>
  <aura-route path="*" view="template::not-found"></aura-route>
</aura-router>

<template id="about-page">
  <h1>About</h1>
  <p>Static markup or Web Components go here.</p>
</template>

<template id="not-found">
  <h1>404</h1>
</template>
```

If `view` is just a file name (e.g. `users.html`), Aura fetches that HTML from the server. That is the usual way to load pages after the first full page load.

**3. Add in-app links**

```html
<a href="/" aura-router-link>Home</a>
<a href="/users" aura-router-link>Users</a>
```

Clicks on `[aura-router-link]` update the URL and swap the outlet — no full reload.

Or navigate from code:

```ts
const router = document.querySelector('aura-router');
router?.navigate('/users');
router?.navigate('/users', { replace: true });
```

Try the local demo in [`demo-space/`](./demo-space) (`cd demo-space && npm install && npm run dev`) — scratch pad, not a reference app; it will change.

---

## Navigation

| Mechanism | Usage |
| --- | --- |
| **Link interception** | `aura-router-link` on `<a href="…">` |
| **Programmatic** | `router.navigate('/path', { replace?: boolean, syncHistory?: boolean })` |
| **404 catch-all** | `<aura-route path="*" view="template::not-found">` |
| **Fallback 404** | `error-template` on `<aura-router>` — see [Router defaults](#router-defaults) |

### How `href` resolves

The link’s **`href`** is what matters — for search engines, users without JavaScript, and the router. Relative links (like `href="profile"`) are resolved from the current page URL, same idea as in a normal website.

| Link in markup | Current URL | Resolves to |
| --- | --- | --- |
| `href="/users"` | any | `/users` |
| `href="profile"` | `/app/settings/` | `/app/settings/profile` |
| `href="."` | `/app/settings/profile` | `/app/settings` |

Inside a layout, prefer short relative links (`settings`, `.`). Use absolute paths (`/login`) when leaving that section. Normal external links and `#hash`-only links are left alone.

### Route `path` vs address bar

| | Route `path` attr | Browser URL (canonical) |
| --- | --- | --- |
| **Folder + index** | `/app/settings` + child `path="."` | index → `/app/settings/` |
| **Index child** | `path="."` | same as folder URL |
| **Leaf** | `profile` → `/app/settings/profile` | `/app/settings/profile` — no trailing slash |

When you open a section’s home route (`path="."`), Aura may add a trailing slash in the address bar (`/app/settings` → `/app/settings/`) so relative links inside the layout behave like a normal folder URL. If the section has no `path="."` child, that slash rewrite does not run.

---

## Views

The `view` attribute tells the router **what to render**.

**Syntax:** `view="content"` or `view="loader::content"`.

- **No `::`** — shorthand for fetching HTML: `view="users.html"` → `url` loader (HTML-first / MPA→SPA default).
- **With `::`** — pick a loader explicitly: `html::<p/>`, `template::app-shell`, …

### Built-in loaders

| Loader | `content` | Description |
| --- | --- | --- |
| `url` | `.html` path | Fetch **HTML** from server — primary HTML-first path |
| `html` | markup | Inline HTML in the attribute |
| `template` | template id | Clone from `<template id="…">` |
| `component` | tag name | Mount a registered custom element (client-side) |
| `import` | module path | Dynamic `import()` and register the component (client-side) |
| `iframe` | URL | Embed external page in `<iframe>` |

Prefer `url`, `html`, and `template` when the page should be real HTML (good for first visit and SEO). Use `component` or `import` when a part of the UI is a Web Component loaded from JavaScript — helpful inside an app, but not a replacement for a full HTML page on first visit.

```html
<aura-route path="/users" view="users.html"></aura-route>
<aura-route path="/hello" view="html::<p>Hello</p>"></aura-route>
<aura-route path="/card" view="template::card"></aura-route>
<aura-route path="/app" view="import::./pages/app.ts"></aura-route>
<aura-route path="/embed" view="iframe::https://example.com/widget"></aura-route>
```

Use `import` for `.js` / `.ts`, not bare `url` content. Custom elements can also live **inside** fetched or templated HTML — they upgrade like any Web Component page.

### `extract` — fragment from full HTML pages

Use `extract` when a fetched page is full HTML and the outlet should mount only one node — a CSS selector for that root. Applies to `url` views (`view="page.html"` / `url::…`), not to inline `html::…`.

```html
<!-- default for every child route -->
<aura-router extract="#main">
  <aura-route path="/about" view="about.html"></aura-route>
  <!-- opt out: keep the full response -->
  <aura-route path="/partial" view="snippet.html" extract="none"></aura-route>
  <!-- override -->
  <aura-route path="/article" view="article.html" extract="#body"></aura-route>
</aura-router>
```

| Attr | Meaning |
| --- | --- |
| `extract="#main"` | Take `outerHTML` of the first match |
| *(no match)* | Fall back to the full HTML (`console.warn`) |
| `extract="none"` / `off` / `false` / `""` | Opt out of an inherited default |
| *(absent)* | Inherit from `<aura-router>` / parent `<aura-route>` |

Selector stays in `extract`, not inside `view`.

---

## Nested routes & layouts

You can nest routes. A parent with `layout` is a shared chrome (nav, sidebar); child pages render into the `<aura-outlet>` inside that layout.

```html
<template id="app-shell">
  <nav>
    <a href="." aura-router-link>Overview</a>
    <a href="settings" aura-router-link>Settings</a>
  </nav>
  <aura-outlet></aura-outlet>
</template>

<aura-router>
  <aura-route path="/app" layout="app-shell">
    <aura-route path="." view="app/index.html"></aura-route>
    <aura-route path="settings" view="app/settings.html"></aura-route>
  </aura-route>
</aura-router>
```

| Pattern | Meaning |
| --- | --- |
| `layout="template-id"` | Shared layout (`<template>` must contain `<aura-outlet>`) |
| `path="."` | The section’s home page (e.g. `/app/`) |
| `path="settings"` | Child segment → `/app/settings` |
| `href="settings"` / `href="."` | Path-relative links inside the layout |

Folder index URLs get a trailing slash in the address bar (`/app` → `/app/` when `path="."` matches) so relative links resolve like the browser expects.

Shared layouts stay mounted across sibling hops. Hook inheritance — see [Lifecycle hooks](#lifecycle-hooks).

---

## Lifecycle hooks

Register hooks with `defineRouteHook(name, fn)` then `AuraRouter.use(…)`, or directly `AuraRouter.use(name, fn)`. Phase attributes (`guard`, `load`, `ready`, …) list **hook names** to run at that phase — comma-separated.

```ts
import { defineRouteHook, AuraRouter } from '@auraui/router';

const AUTH_KEY = 'aura-demo-auth';

const authHook = defineRouteHook('auth', async () => {
  if (sessionStorage.getItem(AUTH_KEY) === '1') return;
  return { type: 'redirect', url: '/login', replace: true };
});

AuraRouter.use(authHook);
// or: AuraRouter.use('show-user', async (ctx) => { … });
```

`guard="auth"` runs the hook named `auth` during the guard phase. Most lifecycle attrs **inherit** from `<aura-router>` and parent `<aura-route>` down the tree; **`load` is local only** (set it on the route that owns the data).

**Override** with your own value (`guard="admin-only"`). **Opt out** of inheritance with `none`, `off`, or `false` — e.g. `guard="none"`, `cache="off"`, `loading-template="none"`.

### Lifecycle

| Attribute | When | Blocking | Inherit |
| --- | --- | --- | :---: |
| `leave` | Before leaving the route | yes | ✓ |
| `guard` | Before entering the route (auth, redirect) | yes | ✓ |
| `load` | Fetch data before render | yes | |
| `ready` | After view is committed (analytics, focus) | no | ✓ |
| `unmount` | Exit cleanup after commit | no | ✓ |
| `update` | Same route leaf; query, hash or params may change | no | ✓ |
| `error` | Navigation or render failure | terminal | ✓ |

### Presentation

> **Experimental.** Transition attrs are still settling and may change before `0.1.0`.

| Attribute | Description |
| --- | --- |
| `transition-in` | Enter animation hooks |
| `transition-out` | Exit animation hooks |
| `transition-order` | `out-in`, `in-out`, or `parallel` |
| `transition` | Shortcut for symmetric in/out hooks |

### Example

```html
<template id="users-shell">
  <nav>
    <a href="." aura-router-link>List</a>
  </nav>
  <aura-outlet></aura-outlet>
</template>

<aura-router guard="auth" ready="analytics">
  <aura-route path="/login" view="login.html" guard="none"></aura-route>
  <aura-route path="/users" layout="users-shell">
    <aura-route path="." view="users.html"></aura-route>
    <aura-route
      path=":id"
      view="users{{id}}.html"
      load="fetch-user"
      ready="track-view">
    </aura-route>
  </aura-route>
  <aura-route
    path="/settings"
    view="settings.html"
    leave="confirm-unsaved">
  </aura-route>
</aura-router>
```

---

## Cache

Control what is kept when leaving a route with the `cache` attribute on `<aura-route>` or `<aura-router>` (inherited; child overrides).

Modes (not a strict ladder — `cache="dom"` keeps DOM + view, but **not** `load` data):

| Attr | DOM keep-alive | View payload | `load` data | Use when |
| --- | --- | --- | --- | --- |
| *(absent)* | | | | Inherit parent / router; else no cache |
| `cache` | | ✓ | ✓ | Cache network/content; remount UI |
| `cache="view"` | | ✓ | | Only HTML / loader payload |
| `cache="data"` | | | ✓ | Only `load` hooks |
| `cache="dom"` | ✓ | ✓ | | Tabs / forms — keep live DOM (`view` is LRU fallback) |
| `cache="all"` | ✓ | ✓ | ✓ | Keep-alive + cached data |
| `cache="off"` / `none` / `false` | | | | Opt out of inherited cache |

```html
<!-- typical page: cache HTML + load, fresh DOM each visit -->
<aura-route path="/feed" view="feed.html" load="fetch-feed" cache></aura-route>

<!-- tab / editor: keep the live DOM -->
<aura-route path="/draft" view="editor.html" cache="dom"></aura-route>

<!-- sticky UI + cached load -->
<aura-route path="/inbox" view="inbox.html" load="fetch-inbox" cache="all"></aura-route>

<!-- how long view/data entries live (seconds → gcTime); omit → store default -->
<aura-route path="/report" view="report.html" load="fetch-report" cache cache-time="60"></aura-route>
```

Unknown values disable cache and log a `console.warn`.

`cache-time` (seconds, inheritable) overrides the long-cache TTL (`gcTime`) for that route’s `view` / `data` entries. It has no effect without a cache mode that keeps those layers. Absent → store default from `AuraRouter.configure`.

### Invalidate from code

```ts
const router = document.querySelector('aura-router');

router?.invalidate();                         // clear cached load data
router?.invalidate({ cache: 'view' });         // clear cached HTML / views
router?.invalidate({ cache: 'all' });          // data + view (not detached DOM)
router?.invalidate({ path: '/users/:id' });    // one route pattern (not the URL)
router?.invalidate({ path: '/items', policy: 'remove' }); // drop now (default: mark stale)
```

Does not remount the current page — navigate again to refetch. Does not clear `cache="dom"` keep-alive. Emits `data-invalidated` (except for `cache: 'view'`).

---

## Loading

While a route is preparing (after guards → until loads finish), you can show loading chrome. Prefer a **body class / events** and keep the previous page on screen — that works with page transitions and matches typical SPA UX.

> **Experimental:** `loading-template` may be removed — outlet skeletons rarely match modern SPA loading (previous page + overlay / body chrome). Prefer `loading-body-class` and loading events.

Optional `loading-template` mounts a skeleton in the outlet when there is **no** page transition.

```html
<template id="loading">
  <p>Loading…</p>
</template>

<style>
  body.loading { cursor: progress; }
  body.loading::after {
    content: "";
    position: fixed;
    inset: 0;
    /* spinner / overlay */
  }
</style>

<aura-router
  loading-body-class="loading"
  loading-template="loading">
  <!-- slow fetch: skeleton OK (no transition on this route) -->
  <aura-route
    path="/contacts"
    view="contacts.html"
    loading-template="loading">
  </aura-route>

  <!-- with transition: template is skipped; body class / events still run -->
  <aura-route
    path="/profile"
    view="profile.html"
    transition-order="parallel"
    transition-in="fade"
    transition-out="fade">
  </aura-route>
</aura-router>
```

| Attr | Meaning |
| --- | --- |
| `loading-body-class` | CSS class on `document.body` during prepare (best default for real apps) |
| `loading-template` | `<template id>` staged in the outlet as a skeleton (previous view stays underneath) |
| `loading-start-event` / `loading-end-event` | Custom event names; default `aura-route-loading` / `aura-route-loading-end`; `none` / `off` / `false` disables |
| `loading-template="none"` | Opt out of an inherited router default |

Attrs inherit from `<aura-router>` (and parent routes) like `extract` / `cache`.

| Rule | Why |
| --- | --- |
| With `transition-order` / transition in–out, **`loading-template` is not mounted** | Skeleton would fight old→new animation; use `loading-body-class` or events |
| Cancel back to the previous URL drops the staged skeleton | Previous committed view was never replaced |
| Prefetch does not show loading chrome | Only the active navigation prepare window |

---

## Router defaults

Some attrs on `<aura-router>` are **defaults for child routes** (override per route; opt out with `none` / `off` / `false`). Others configure the **host only**.

### Inherited by routes

| Attribute | Description |
| --- | --- |
| `guard`, `ready`, `leave`, `unmount`, `update`, `error` | Global hook lists (comma-separated names); **`load` is not inherited** — set per route |
| `cache` / `cache-time` | Cache modes + TTL (seconds) — see [Cache](#cache) |
| `loading-body-class` | Body class during prepare |
| `loading-template` | Skeleton template id (experimental — see [Loading](#loading)) |
| `loading-start-event` / `loading-end-event` | Loading event names (`none` / `off` / `false` disables) |
| `error-template` | Template id on render error; also thin fallback 404 when no `path="*"` |
| `extract` | Default CSS selector for `url` fragment extract |

### Host only (`<aura-router>`)

| Attribute | Description |
| --- | --- |
| `links-selector` | In-app links to intercept / scan (default: `[aura-router-link]`) |
| `links-container-selector` | Limit active-link scan to a subtree (default: whole document) |
| `link-active-class` | Class on the matching link |
| `link-active-branch-class` | Class on section/folder links (prefix match) |
| `outlet` | CSS selector for the root `<aura-outlet>` |

```html
<aura-router
  loading-body-class="loading"
  extract="#main"
  link-active-class="is-active"
  link-active-branch-class="is-active-branch">
  …
</aura-router>
```

---

## Programmatic API

```ts
import { AuraRouter } from '@auraui/router';

AuraRouter.use('auth', async () => { /* … */ });

// Global defaults — layers match route `cache` (dom / view / data)
AuraRouter.configure({
  domCache: { max: 10 },                          // detached DOM (`cache="dom"`)
  viewCache: { max: 50, gcTime: 43_200_000 },     // HTML / loader payloads (~12h)
  dataCache: { staleTime: 30_000, gcTime: 300_000 }, // `load` payloads (30s fresh / 5min GC)
});

AuraRouter.install();

const router = document.querySelector('aura-router');
router?.navigate('/users', { replace: true });
router?.refreshRoutes();
router?.invalidate({ path: '/users/:id' }); // see [Cache](#cache)
```

> **Experimental:** DOM event names on `<aura-router>` may change before `0.1.0`.

DOM events include `navigation-start`, `navigation`, `navigation-complete`, `navigation-cancel`, `navigation-redirect`, `navigation-error`, `navigation-hook-error`, `not-found`, `data-invalidated`, and load `load-start` / `load-end` / `load-error`.

---

## More

| | |
| --- | --- |
| Known gaps | [LIMITATIONS.md](./LIMITATIONS.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) |
| Changelog | [CHANGELOG.md](./CHANGELOG.md) |
| npm | [@auraui/router](https://www.npmjs.com/package/@auraui/router) |

---

## License

MIT covers source code only — not the project name or logos. See [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

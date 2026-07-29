# Aura Router — Guide

Detailed usage for [`@auraui/router`](https://www.npmjs.com/package/@auraui/router). For install and a 30-second example, see the [README](../README.md).

> **Experimental (pre-alpha).** Attribute names below (`guard`, `load`, `ready`, …) are the intended public surface — see [ROADMAP](../ROADMAP.md) and [LIMITATIONS](../LIMITATIONS.md) for gaps and in-flight work.

**Browsers:** modern evergreen (Chrome, Firefox, Safari, Edge) with ES modules, Custom Elements, History API, `fetch`, and `URLPattern` (for `:param` routes). No IE. No Node SSR — see the [README](../README.md#browsers).

## Table of contents

- [Navigation](#navigation)
- [Views](#views)
- [Nested routes & layouts](#nested-routes--layouts)
- [Lifecycle hooks](#lifecycle-hooks)
- [First paint (MPA → SPA)](#first-paint-mpa--spa)
- [Cache](#cache)
- [Loading](#loading)
- [Router defaults](#router-defaults)
- [Programmatic API](#programmatic-api)

---

## Navigation

| Mechanism | Usage |
| --- | --- |
| **Link interception** | `aura-router-link` on `<a href="…">` |
| **Programmatic** | `router.navigate('/path', { replace?: boolean, syncHistory?: boolean })` |
| **404 catch-all** | `<aura-route path="*" view="template::not-found">` |
| **Fallback 404** | `error-template` on `<aura-router>` — see [Router defaults](#router-defaults) |

### How `href` resolves

The link’s **`href`** is what matters — for search engines, users without JavaScript, and the router. The browser resolves relative `href` from the current page URL (same as a normal website). Aura does **not** add a trailing `/` to folder indexes, so path-relative links are easy to get wrong.

| Link in markup | Current URL | Resolves to |
| --- | --- | --- |
| `href="/users"` | any | `/users` |
| `href="profile"` | `/app/settings/` | `/app/settings/profile` |
| `href="profile"` | `/app/settings` | `/app/profile` ← not under settings |
| `href="."` | `/app/settings/profile` | `/app/settings/` |

For MPA→SPA, prefer **root-absolute** links (`/users/1`, `/app/settings`). They work with and without JavaScript and do not depend on trailing slashes.

### Route `path` vs address bar

| | Route `path` attr | Browser URL |
| --- | --- | --- |
| **Folder + index** | `/app/settings` + child `path="."` | `/app/settings` or `/app/settings/` (same route; form from the link is kept) |
| **Index child** | `path="."` | same URL as the folder |
| **Child segment** | `profile` under `/app/settings` | `/app/settings/profile` |
| **Leaf** | absolute `/app/settings/profile` | `/app/settings/profile` |

Aura **joins** nested `path` values into one pattern (`/app` + `settings` → `/app/settings`; `/users` + `:id` → `/users/:id`). Matching treats `/users` and `/users/` as the same route. The address bar keeps the pathname as resolved from the link (including a trailing `/` when present) — Aura does not strip or add one. If you need one public canonical URL, handle redirects on the server.

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
    <a href="/app" aura-router-link>Overview</a>
    <a href="/app/settings" aura-router-link>Settings</a>
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
| `path="."` | Section home — same URL as the parent folder (e.g. `/app`) |
| `path="settings"` | Child segment joined to parent → `/app/settings` |
| `href="/app/settings"` | Root-absolute link (recommended in layouts) |
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
    <a href="/users" aura-router-link>List</a>
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

## First paint (MPA → SPA)

Aura does not run on the server. For SEO and first paint, the host can send **ready HTML** for the current URL. If that markup is marked with `aura-router-ssr`, the router **adopts** it on boot instead of fetching the route `view` again. Successful adopt also **skips** the navigation lifecycle (`guard` / `load` / `ready`) — put critical data in the server HTML. Later in-app navigations use the normal SPA pipeline.

### Marker

Add `aura-router-ssr` on the content root the server already rendered:

```html
<body>
  <header>…</header>

  <div aura-router-ssr>
    <h1>About</h1>
    <p>…</p>
  </div>

  <aura-router>
    <aura-route path="/about" view="about.html"></aura-route>
    <aura-route path="/users" view="users.html"></aura-route>
  </aura-router>

  <script type="module">
    import { AuraRouter } from '@auraui/router';
    AuraRouter.install();
  </script>
</body>
```

| When | Behavior |
| --- | --- |
| Marker present + URL matches a **flat** page route (no layout parent in the match) | Adopt the marked node; skip first-paint fetch/remount and lifecycle; sync active links |
| Marker present + URL matches a **nested** chain (layout + leaf), and markup mirrors the outlet tree | Adopt each level; skip first-paint fetch/remount and lifecycle; sync active links |
| No marker, no match, or `redirect` route | Normal first navigation (load `view` as usual) |
| Match includes a **layout** parent, but markup is only a single blob (no nested outlets / view roots) | Falls back to a normal first navigation |

**Nested adopt** needs the same shape the client would mount: each layout root is a direct child of its outlet and contains a direct child `<aura-outlet>` whose next view root is marked `data-aura-view-root` (and so on down the chain). The top-level marker may omit `data-aura-view-root` — `outlet.adopt` sets it. Nested levels must already have the attribute for the dry-run plan to succeed.

```html
<!-- Server HTML for /settings/profile -->
<aura-outlet>
  <div aura-router-ssr data-aura-view-root>
    <!-- settings layout chrome -->
    <aura-outlet>
      <div data-aura-view-root>
        <!-- profile page -->
      </div>
    </aura-outlet>
  </div>
</aura-outlet>

<aura-router>
  <aura-route path="/settings" layout="settings-shell">
    <aura-route path="profile" view="settings/profile.html"></aura-route>
  </aura-route>
</aura-router>
```

Keep durable chrome (site header, primary nav) **outside** the marked node if it should stay when the first client navigation replaces that view. Place `<aura-outlet>` in the same layout slot (sibling or nearby) so after the first SPA transition new pages appear where the server content was.

### With `url` + `extract`

Declare `view` / `extract` for **later** navigations as usual. First paint still uses the marked DOM; returning to the URL later may fetch and extract:

```html
<aura-router extract="#main">
  <aura-route path="/about" view="about.html"></aura-route>
</aura-router>

<div id="main" aura-router-ssr>
  <!-- same fragment extract would take from about.html -->
</div>
```

No extra API beyond `AuraRouter.install()` and a connected `<aura-router>`.

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

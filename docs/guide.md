# Aura Router – Guide

Aura Router upgrades ordinary HTML pages with client-side navigation. This is the canonical guide for [`@auraui/router`](https://www.npmjs.com/package/@auraui/router); use the [recipes](./recipes/README.md) for focused copy-and-paste patterns.

> **Current release: 0.1.0.** Pin the package version and check the [changelog](../CHANGELOG.md) when upgrading.

New to Aura Router? Complete the [README Quick start](../README.md#quick-start) first. This guide then proceeds linearly from installation and routing basics to optional features and the API reference.

## Contents

- [Installation](#installation)
- [Core concepts](#core-concepts)
- [Defining routes](#defining-routes)
- [Navigation](#navigation)
  - [How `href` resolves](#how-href-resolves)
- [Route match priority](#route-match-priority)
- [Redirects](#redirects)
- [Views](#views)
  - [Custom loaders](#custom-loaders)
  - [`extract` – fragment from full HTML pages](#extract--fragment-from-full-html-pages)
- [Nested routes & layouts](#nested-routes--layouts)
- [Same-route updates](#same-route-updates)
- [Lifecycle hooks](#lifecycle-hooks)
  - [Register hooks](#register-hooks)
  - [Attach hooks to routes](#attach-hooks-to-routes)
  - [Phase order and inheritance](#phase-order-and-inheritance)
  - [Hook context](#hook-context)
  - [Control navigation](#control-navigation)
  - [Load route data](#load-route-data)
  - [Stop stale async work](#stop-stale-async-work)
  - [Transitions](#transitions)
- [First paint (MPA → SPA)](#first-paint-mpa--spa)
  - [Flat pages](#flat-pages)
  - [Nested layouts](#nested-layouts)
  - [Adoption outcomes](#adoption-outcomes)
  - [After first paint](#after-first-paint)
- [Scroll](#scroll)
  - [Scroll policy](#scroll-policy)
  - [Target and animation](#target-and-animation)
  - [History, hashes, and reduced motion](#history-hashes-and-reduced-motion)
- [Prefetch](#prefetch)
  - [Prefetch modes](#prefetch-modes)
  - [Policy cascade](#policy-cascade)
  - [Manual prefetch](#manual-prefetch)
  - [Safeguards](#safeguards)
- [Cache](#cache)
  - [Cache layers](#cache-layers)
  - [Lifetime and identity](#lifetime-and-identity)
  - [Invalidate cached entries](#invalidate-cached-entries)
- [Loading](#loading)
  - [Loading options](#loading-options)
  - [Outlet skeleton](#outlet-skeleton)
  - [Special cases](#special-cases)
- [Not found (404)](#not-found-404)
  - [Catch-all routes](#catch-all-routes)
  - [Unmatched URL fallback](#unmatched-url-fallback)
  - [Custom 404 handling](#custom-404-handling)
- [Navigation errors](#navigation-errors)
- [Active links & accessibility](#active-links--accessibility)
  - [Configure active classes](#configure-active-classes)
  - [Exact and branch matches](#exact-and-branch-matches)
  - [Link scope](#link-scope)
  - [Read the active route branch](#read-the-active-route-branch)
  - [Focus after navigation](#focus-after-navigation)
- [Router defaults](#router-defaults)
  - [Inherited route defaults](#inherited-route-defaults)
  - [Router-only settings](#router-only-settings)
  - [Override a default](#override-a-default)
- [Programmatic API](#programmatic-api)
  - [Install and configure](#install-and-configure)
  - [Register hooks and loaders](#register-hooks-and-loaders)
  - [Navigate and prefetch](#navigate-and-prefetch)
  - [Invalidate, refresh, and fallback](#invalidate-refresh-and-fallback)
  - [Read runtime state](#read-runtime-state)
  - [Change route markup](#change-route-markup)
  - [DOM events](#dom-events)
- [Compatibility and related links](#compatibility-and-related-links)

## Installation

Pin the current `0.x` release, import the package, then install the custom elements once:

```bash
npm install --save-exact @auraui/router@0.1.0
```

```ts
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

`install()` defines `<aura-router>`, `<aura-route>`, and `<aura-outlet>`. Register global hooks and custom loaders before the router connects when its initial navigation depends on them. The package also exports the `AuraRoute` and `AuraOutlet` classes for typed DOM access.

Without a bundler:

```html
<script type="module">
  import { AuraRouter } from 'https://esm.sh/@auraui/router@0.1.0';
  AuraRouter.install();
</script>
```

Your server or static host must still serve useful HTML for every public URL. Aura Router runs only in the browser.

## Core concepts

Three elements define the routing model:

| Element         | Responsibility                                                            |
| --------------- | ------------------------------------------------------------------------- |
| `<aura-router>` | Owns navigation, history, defaults, link handling, and the route registry |
| `<aura-route>`  | Maps a path to a view, layout, redirect, hooks, and policies              |
| `<aura-outlet>` | Receives the active view; nested layouts contain another outlet           |

For a normal client navigation, think:

**match → guard → load → render or update → ready**

Leaving routes run `leave` before entering guards. Rendering can include transition hooks and `unmount`. Failures enter the `error` phase. First-paint adoption is intentionally different – it reuses server HTML and skips `guard`, `load`, and `ready`.

A minimal router:

```html
<nav>
  <a href="/" aura-router-link>Home</a>
  <a href="/about" aura-router-link>About</a>
</nav>

<aura-outlet></aura-outlet>
<aura-router>
  <aura-route path="/" view="home.html"></aura-route>
  <aura-route path="/about" view="about.html"></aura-route>
</aura-router>
```

Start with `path`, `view`, marked links, and one outlet. Add layouts, hooks, prefetch, and caching only where they solve a concrete problem.

This example loads HTML fragments. For the complete-page approach shown in the README, use [`extract`](#extract--fragment-from-full-html-pages) and follow [First paint](#first-paint-mpa--spa).

## Defining routes

Every `<aura-route>` needs `path`. A page needs `view`; a folder may contain child routes and optionally `layout`; a redirect uses `redirect`.

```html
<aura-router>
  <aura-route path="/" view="home.html"></aura-route>
  <aura-route path="/users/:id" view="users/:id.html"></aura-route>
  <aura-route path="/old" redirect="/new"></aura-route>
  <aura-route path="*" view="template::not-found"></aura-route>
</aura-router>
```

Nested paths are joined: `/app` + `settings` becomes `/app/settings`. `path="."` is an index child at its parent URL. Matching treats `/users` and `/users/` as the same route, but Aura preserves the form used in the address bar.

Use UTF-8 directly in route paths. The browser may display an encoded URL, but Aura decodes the pathname before matching:

```html
<aura-route path="/мир-труд-май" view="мир-труд-май.html"></aura-route>
```

Parameterized routes require the browser's `URLPattern`. Catch-all values are available as `params.splat`; a scoped `/users/*` requires a non-empty tail.

## Navigation

Mark only links that Aura should intercept:

```html
<a href="/users/42?tab=profile" aura-router-link>User</a>
```

Aura resolves the anchor's `href` as the browser does, requires the result to stay on the same origin, then navigates with `pathname + search + hash`.

It leaves these clicks to the browser:

- clicks with `Ctrl`, `Cmd`, `Shift`, or `Alt` held;
- middle- and right-button clicks;
- links with a non-self `target` or `download`;
- external-origin URLs;
- missing or empty `href`;
- hash-only links such as `#details`;
- events already cancelled with `preventDefault()`.

Programmatic navigation accepts an app path string:

```ts
const router = document.querySelector('aura-router');
router?.navigate('/users?sort=name', { replace: false });
```

Pass query parameters as part of the URL string:

```ts
router?.navigate('/users?sort=name&page=2');
```

`navigate()` currently does not accept a `{ pathname, query, hash }` target object; that overload is [planned](../ROADMAP.md#phase-5--developer-facing-api). Routes also do not declare query schemas. Inside hooks, read the parsed values from `ctx.to.query`.

### How `href` resolves

Root-absolute links are the safest choice for MPA → SPA sites:

| Markup                           | Current URL             | In-app target           |
| -------------------------------- | ----------------------- | ----------------------- |
| `href="/users"`                  | any                     | `/users`                |
| `href="profile"`                 | `/app/settings/`        | `/app/settings/profile` |
| `href="profile"`                 | `/app/settings`         | `/app/profile`          |
| `href="."`                       | `/app/settings/profile` | `/app/settings/`        |
| same-origin `https://host/users` | any                     | `/users`                |
| `href="/p?q=1#tab"`              | any                     | `/p?q=1#tab`            |

Same-origin checks include scheme, host, and port. The same resolution rules power clicks, prefetch, and active-link matching. Aura does not add or remove trailing slashes; use server redirects if your site requires one canonical form.

## Route match priority

Aura chooses one leaf from the joined route patterns.

| Pattern                             | Score                            |
| ----------------------------------- | -------------------------------- |
| Static or `:param`                  | Number of path segments          |
| Scoped catch-all such as `/users/*` | Parent segment count minus `0.5` |
| Global `*`                          | `-1`                             |

Selection rules:

An exact static match wins by default. A dynamic route replaces it only if it has a higher score. On ties, static beats a parameter route at the same depth, while dynamic routes follow declaration order.

```html
<aura-route path="/users">
  <aura-route path="about" view="about.html"></aura-route>
  <aura-route path=":id" view="user.html"></aura-route>
  <aura-route path="*" view="users-404.html"></aura-route>
</aura-route>
<aura-route path="*" view="site-404.html"></aura-route>
```

For `/users/about`, the static route beats `:id`. For `/users/x/y`, the scoped catch-all wins. Duplicate identical static patterns are unsafe – the later indexed route overwrites the earlier exact-map entry.

## Redirects

A redirect route forwards navigation without rendering its own view. Use it for:

- unconditional in-app aliases;
- a default child route for a nested section.

```html
<aura-route path="/account" redirect="/settings/profile"></aura-route>
```

Use a guard when the destination depends on runtime state, such as authentication. Use a server redirect for permanent URL changes, SEO, or behaviour that must work without JavaScript.

A target beginning with `/` is absolute. A relative target resolves against the parent route, which makes it useful for choosing a default child:

```html
<aura-route path="/app">
  <aura-route path="." redirect="dashboard"></aura-route>
  <aura-route path="dashboard" view="dashboard.html"></aura-route>
</aura-route>
```

Rules:

- A redirect route cannot also declare `view`, `layout`, or child routes.
- Aura resolves redirect chains before rendering, carries the original query and hash to the destination, and replaces the redirected history entry.
- A cycle or more than five redirect hops becomes a navigation error.
- The target is literal: route parameters from the source path are not substituted into `redirect`.

## Views

The `view` attribute tells Aura where a route's content comes from. For an HTML page, provide its URL directly:

```html
<aura-route path="/users" view="users.html"></aura-route>
```

A value without `::` is treated as an HTML URL. To use another source, prefix the value with a loader name and `::`. The part after `::` is passed to that loader:

- `url::page.html` – fetch HTML; `view="page.html"` is the shorter equivalent.
- `html::<p>Hello</p>` – render inline HTML.
- `template::card` – clone `<template id="card">`.
- `component::user-card` – create an already registered custom element.
- `import::./pages/app.js` – import a component module, register its component, and mount it.
- `iframe::https://example.com` – mount a lazy-loading iframe.

```html
<aura-route path="/hello" view="html::<p>Hello</p>"></aura-route>
<aura-route path="/card" view="template::card"></aura-route>
<aura-route path="/app" view="import::./pages/app.js"></aura-route>

<template id="card"><article>Card content</article></template>
```

Before the loader runs, matched route parameters replace corresponding `:name` tokens in its input:

```html
<aura-route path="/users/:id" view="users/:id.html"></aura-route>
```

For `/users/42`, Aura loads `users/42.html`. Tokens without a matching route parameter remain unchanged.

Treat route attributes as trusted application configuration. Aura does not sanitise inline or fetched HTML, or allow-list `url` and `iframe` targets. Never build a `view` value from untrusted input; see [SECURITY.md](../SECURITY.md).

### Custom loaders

Create a custom loader when the built-in sources are not enough. Register it before the router connects, then use its name as the `view` prefix:

```ts
AuraRouter.registerLoader('badge', async ({ content, route }) => ({
  kind: 'markup',
  value: `<user-badge status="${content}" user="${route.params?.id}"></user-badge>`,
}));
```

```html
<aura-route path="/users/:id" view="badge::active"></aura-route>
```

The loader receives:

- `content` – the value after `::`;
- `route` – the current `href`, route `pattern`, `params`, and `query`;
- `data` – the result of route load hooks, when available;
- `kind`, `extract`, and an abort `signal`.

Return `{ kind: 'html' | 'markup' | 'fragment', value }`, or `null` when aborted. Loader names share one process-wide registry. If rendered output depends on load-hook data, register with `{ needsData: true }` so the view cache includes that data in its identity. `getLoader(id)` returns the registered loader and throws when the name is unknown.

### `extract` – fragment from full HTML pages

When a URL returns a complete HTML page, `extract` selects the part Aura should mount. It applies only to `url` views:

```html
<aura-router extract="#main">
  <aura-route path="/about" view="about.html"></aura-route>
  <aura-route path="/raw" view="raw.html" extract="none"></aura-route>
</aura-router>
```

Here, `/about` mounts the complete `#main` element, including the element itself. The `/raw` route disables the router's inherited selector and mounts the full response.

If the selector does not match, Aura warns and falls back to the full response. Set `extract` to `none`, `off`, `false`, or an empty value to disable an inherited selector. On a flat initial route, the same selector also enables [first-paint adoption](#first-paint-mpa--spa).

## Nested routes & layouts

Nested routes let several pages share UI without remounting it on every navigation. The parent route provides a layout, and its child routes provide the changing content.

```html
<template id="app-shell">
  <nav><a href="/app/settings" aura-router-link>Settings</a></nav>
  <aura-outlet></aura-outlet>
</template>

<aura-outlet></aura-outlet>
<aura-router>
  <aura-route path="/app" layout="app-shell">
    <aura-route path="." view="app/index.html"></aura-route>
    <aura-route path="settings" view="app/settings.html"></aura-route>
  </aura-route>
</aura-router>
```

For `/app/settings`, Aura mounts `app-shell` into the root outlet, then mounts `app/settings.html` into the outlet inside that layout. Moving between `/app` and `/app/settings` keeps the shell mounted and changes only the child view.

The layout value is a `<template>` id, and every layout template must contain an `<aura-outlet>`. The child with `path="."` handles the parent's own `/app` URL. Without that index child, `/app` displays the layout with an empty nested outlet.

**Path-only parent routes**

A path-only parent route has children but no `layout`. It adds a shared path, passes inherited policy to its children, and does not render UI or become a page by itself:

```html
<aura-route path=":lang" guard="locale">
  <aura-route path="about" view=":lang/about.html"></aura-route>
</aura-route>
```

Here, the child matches URLs such as `/en/about`, while the parent's `guard` applies to every child.

Layout parents and path-only parent routes both pass most route policy to their children. `path`, `view`, `layout`, `redirect`, and `load` always stay local.

For the server-rendered HTML required when a nested URL loads directly, see [First paint](#first-paint-mpa--spa).

## Same-route updates

A URL can change while still matching the same `<aura-route>`. For example, both `/users/1` and `/users/2` match `/users/:id`; changing only the query string also keeps the same route matched.

Aura then decides whether to reuse the mounted view or remount the route.

**Automatic behaviour**

By default, Aura compares the resolved view before and after navigation:

- If the view source is unchanged, Aura keeps the existing DOM, runs `load` again, then calls the route's `update` hooks.
- If parameter substitution changes the view source, Aura remounts the route.

```html
<aura-route
  path="/users/:id"
  view="users/shell.html"
  load="fetch-user"
  update="apply-user"
>
</aura-route>
```

In this example, moving from `/users/1` to `/users/2` keeps `users/shell.html` mounted. `fetch-user` loads the new data, and `apply-user` updates the existing DOM. Aura does not patch that DOM automatically – the `update` hook must apply the new data.

With `view="users/:id.html"`, the resolved source changes from `users/1.html` to `users/2.html`, so Aura remounts the route instead.

**Override the decision**

Add the optional `param-change` attribute to `<aura-route>` when you need to override the automatic choice:

- `param-change="update"` always reuses the mounted view. Use it only when the `update` hook can safely refresh all route content. Aura warns if the resolved view source changed because the old HTML may become stale.
- `param-change="navigate"` always remounts the route, even when the view source is unchanged.

An in-place update runs `load` and `update`, but skips `guard`, `leave`, rendering, `unmount`, and `ready`. A remount follows the normal navigation lifecycle while keeping unchanged parent layouts mounted.

Hash-only navigation is different: it performs anchor scrolling without running this update flow. Navigating to the exact same pathname and query re-applies scrolling without rerunning the route lifecycle.

## Lifecycle hooks

Lifecycle hooks run application code at specific points in navigation. Typical uses include authentication, data loading, updating reused DOM, cleanup, analytics, and transitions.

### Register hooks

Give a hook a name and register it once:

```ts
import { AuraRouter, defineRouteHook } from '@auraui/router';

const auth = defineRouteHook('auth', async (ctx) => {
  if (sessionStorage.getItem('auth')) return;
  return '/login';
});

AuraRouter.use(auth);
```

`AuraRouter.use('auth', fn, options)` is the direct registration form. Its options are copied into `ctx.options` for that hook. `AuraRouter.unuse('auth')` removes a registration.

`defineRouteHook(name, fn, { version?, requires? })` defaults the hook version to `1.0.0`. If `requires` is present, registration throws when the current router version does not satisfy that range.

Hook names must start with a letter and may contain lowercase or caseless Unicode letters, digits, and hyphens. Uppercase letters are not accepted.

### Attach hooks to routes

Reference a registered hook by name from the relevant lifecycle attribute:

```html
<aura-route path="/account" view="account.html" guard="auth"></aura-route>
```

An attribute may contain several comma-separated names. They run in declaration order:

```html
<aura-route path="/admin" guard="auth, require-admin"></aura-route>
```

Register hooks before the router connects when its initial navigation needs them.

### Phase order and inheritance

For a normal route change, the main flow is:

`leave` → `guard` → `load` → render and transitions → `unmount` → commit → `ready`

| Attribute        | Purpose                                                      | When / where it runs                   |
| ---------------- | ------------------------------------------------------------ | -------------------------------------- |
| `leave`          | Allow, cancel, or redirect away from active routes           | Active child first, then its parents   |
| `guard`          | Allow, cancel, or redirect into new routes                   | Parents first, then the target child   |
| `load`           | Produce route data before rendering                          | Each newly entered route               |
| `transition-out` | Animate or otherwise present the outgoing view               | Routes being exited                    |
| `transition-in`  | Animate or otherwise present the incoming view               | Routes being entered                   |
| `unmount`        | Clean up resources owned by an exited view                   | Routes being exited                    |
| `ready`          | Run setup, focus, or analytics after the new view commits    | Routes being entered                   |
| `update`         | Apply new data when a same-route view is reused              | The matched route whose view is reused |
| `error`          | Observe or handle a terminal navigation or rendering failure | The route associated with the failure  |

Only `leave` and `guard` can cancel or redirect navigation. `load` is deliberately local to its route; every other phase attribute inherits through parent routes unless overridden.

An in-place [same-route update](#same-route-updates) uses the shorter `load` → `update` flow and does not run the full sequence above.

### Hook context

Every hook receives a context object describing the navigation:

| Field               | What it provides                                                          |
| ------------------- | ------------------------------------------------------------------------- |
| `to`, `from`        | Target and previous `{ pathname, params?, query? }`; `from` may be `null` |
| `route`             | The `<aura-route>` instance whose phase is running                        |
| `phase`             | The current lifecycle phase                                               |
| `data`              | Data produced by the route's load hooks, when available                   |
| `transactionSignal` | An abort signal for navigation superseded by a newer one                  |
| `router`            | `navigate(path, options?)` for programmatic navigation                    |
| `action`            | The current history action                                                |
| `transactionId`     | The current navigation transaction id                                     |
| `options`           | The registration options passed to `AuraRouter.use`                       |
| `parent()`          | In `load` only, await the nearest ancestor's load result                  |
| `error`             | The failure object, available in the `error` phase                        |

### Control navigation

Only `leave` and `guard` use return values to control navigation:

```ts
return true; // continue
return false; // cancel
return '/login'; // redirect
```

Returning nothing also continues navigation. Use an object when you want the result to be explicit or need redirect options:

```ts
return { type: 'cancel', reason: 'unsaved-changes' };
return { type: 'redirect', url: '/login', replace: true };
return { url: '/login', replace: true }; // shorter redirect object
```

All of these forms are intentional parts of the public hook contract. An explicit cancellation passes its optional `reason` to the `navigation-cancel` event; use a stable code rather than user-facing text.

`update`, `ready`, `unmount`, transition, and `error` hooks may be async, but should not return a control value. Aura awaits their completion and ignores the resolved value. Returning cancel or redirect from those phases produces a warning.

### Load route data

A `load` hook's return value is data, not a navigation result: a string remains a string and does not redirect. One load hook produces its value directly; multiple load hooks produce an object keyed by hook name.

Parent and child loads start in parallel. A child waits for its nearest ancestor only when it explicitly calls and awaits `ctx.parent()`.

In TypeScript, use `RouteLoadFn<TData>` to type a load result:

```ts
import { AuraRouter, type RouteLoadFn } from '@auraui/router';

interface Account {
  id: string;
  name: string;
}

const loadAccount: RouteLoadFn<Account> = async (ctx) => {
  const response = await fetch('/api/account', {
    signal: ctx.transactionSignal,
  });
  return response.json() as Promise<Account>;
};

AuraRouter.use('load-account', loadAccount);
```

### Stop stale async work

A newer navigation aborts the previous transaction. Long-running hooks should pass `transactionSignal` to supported APIs and stop custom work when it aborts:

```ts
const response = await fetch('/api/account', {
  signal: ctx.transactionSignal,
});
```

### Transitions

> **0.x note.** Transition attributes and ordering may evolve before `1.0.0`.

Transitions are lifecycle hooks for the outgoing and incoming views. Aura awaits them in the order selected by `transition-order`.

`transition="fade"` uses the same registered hook for both views. Two names assign separate outgoing and incoming hooks: `transition="fade-out, fade-in"`.

| Attribute                         | Meaning                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `transition-in`, `transition-out` | Comma-separated hook names; inherited independently                           |
| `transition`                      | Symmetric or out/in shortcut; inherited                                       |
| `transition-order`                | `parallel` (default when transitions exist), `out-in`, or `in-out`; inherited |

Use `none`, `off`, or `false` to opt out of inherited hooks or transition sides.

## First paint (MPA → SPA)

On the first page load, the document may already contain HTML for the current URL. Aura can adopt this markup as the active route instead of fetching and mounting the same view again.

Aura does not render HTML on the server. Your server or static host remains responsible for returning the page. Successful adoption skips `guard`, `load`, and `ready`, so the response must already contain the correct access decision and any critical first-paint data.

### Flat pages

For a flat route, render an element that matches the router's `extract` selector. Aura adopts that element as the route view:

```html
<main id="content"><h1>About</h1></main>

<aura-router extract="#content">
  <aura-route path="/about" view="/about"></aura-route>
</aura-router>
```

No `aura-router-ssr` marker is needed for this flat case.

### Nested layouts

For a nested route, the server HTML must match the outlet structure that Aura would mount. Mark the root layout with `aura-router-ssr`:

```html
<aura-outlet>
  <section aura-router-ssr data-aura-view-root>
    <nav>Settings</nav>
    <aura-outlet>
      <main data-aura-view-root>Profile</main>
    </aura-outlet>
  </section>
</aura-outlet>
```

For Aura to adopt every level:

- each layout root is a direct child of its parent `<aura-outlet>`;
- each layout has a direct-child `<aura-outlet>` for the next level;
- nested view roots have `data-aura-view-root`;
- the marked root may omit `data-aura-view-root` because Aura adds it.

`aura-router-ssr` is only a DOM marker, not a server runtime. Its exported constant is `AURA_ROUTER_SSR_ATTR`.

### Adoption outcomes

| Initial state                                          | Result                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Flat match with an `extract` node                      | Adopt it and sync active links                                          |
| Valid marked nested outlet tree                        | Adopt every level                                                       |
| Marker on a flat match                                 | Marker wins over `extract`                                              |
| No usable node, no match, or redirect                  | Run normal initial navigation                                           |
| Nested match with a leaf blob or malformed outlet tree | `structure-error` – preserve server HTML and do not immediately remount |

On `structure-error`, fix the returned outlet hierarchy rather than forcing a client remount. Keep durable site chrome outside the adopted node if later SPA navigation should not replace it.

### After first paint

Adoption is a bootstrap-only shortcut. Returning to an adopted URL later uses the normal route view loader; for a `url` view, Aura fetches the page and applies the same `extract` selector.

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

## Not found (404)

Aura handles two different not-found cases:

- a catch-all route matches and renders a normal application page;
- no route matches, so Aura runs its fallback chain.

### Catch-all routes

Use `path="*"` for the application's normal 404 page:

```html
<aura-route path="*" view="template::not-found"></aura-route>

<template id="not-found"><h1>Page not found</h1></template>
```

A catch-all nested under a parent route can provide section-specific 404 UI. After it commits, Aura dispatches `not-found` with `source: 'route'`. This event is informational and cannot be cancelled.

### Unmatched URL fallback

When no route, including a catch-all, matches the URL, Aura tries these options in order:

1. dispatch cancelable `not-found` with `source: 'fallback'`;
2. if not prevented, call the instance `setNotFoundHandler`;
3. otherwise call the handler from `AuraRouter.configure`;
4. otherwise mount the router's [`error-template`](#navigation-errors);
5. otherwise mount plain `Page not found: …` text.

An `error-template` may contain `[data-not-found-url]`. Aura fills every matching element with the decoded missing URL.

### Custom 404 handling

Use an instance handler when one router needs custom fallback behaviour:

```ts
router.setNotFoundHandler((url) => {
  document.querySelector('aura-outlet')!.textContent = `Missing: ${url}`;
});
```

Pass `null` to clear the instance override. If a global handler is configured through `AuraRouter.configure({ notFoundHandler })`, it becomes active again.

For complete control, listen for fallback `not-found`, render the response, and call `event.preventDefault()`. Preventing the event suppresses every built-in fallback, including handlers and `error-template`.

## Navigation errors

For navigation and rendering failures, inherited `error` hooks receive the normal hook context plus `error`.

`error-template` provides failure UI. It also serves as the final templated fallback when no route matches and no custom 404 handler takes over. It is not a nested error-boundary system.

Aura emits `navigation-error` for a failed navigation. If an `error` hook itself throws, Aura also emits `navigation-hook-error`.

Stable `NavigationFailureCode` values are `NOT_FOUND`, `REDIRECT_CYCLE`, `REDIRECT_DEPTH_EXCEEDED`, `GUARD_THROW`, `HOOK_THROW`, `LOAD_FAILED`, `CONTENT_LOAD_FAILED`, `RENDER_FAILED`, `TRANSITION_FAILED`, `UPDATE_FAILED`, and `INTERNAL`.

## Active links & accessibility

Aura can mark links to the current page and links to its parent sections.

### Configure active classes

Set the class names on `<aura-router>`:

```html
<aura-router
  link-active-class="is-active"
  link-active-branch-class="is-active-branch"
>
</aura-router>
```

When a link becomes exact, Aura adds `aria-current="page"`. It removes the attribute when the link is no longer exact.

### Exact and branch matches

| Match  | Applied state when configured                             |
| ------ | --------------------------------------------------------- |
| Exact  | Exact class, branch class, and `aria-current="page"`      |
| Branch | Branch class only; no `aria-current` for an ancestor link |

An exact match requires the same pathname and query string. A trailing slash is ignored. If either URL has a hash, the hashes must also match.

A branch match requires the current pathname to continue after the link pathname at a segment boundary. For example, `/docs` matches `/docs/guide`, but not `/docs-old`. The root path `/` is not treated as a branch of every page, and an explicit link query must match the current query.

URLs with a hash do not receive branch matches.

### Link scope

`links-container-selector` narrows scanning to the closest matching ancestor of the router. `links-selector` controls both interception and scanning and defaults to `[aura-router-link]`.

### Read the active route branch

The runtime `activeRouteBranch` getter returns the current matched route chain from root to leaf:

```ts
router.activeRouteBranch; // [{ pattern, href }, ...]
```

It updates after navigation settles and when Aura restores the URL after a cancelled navigation.

### Focus after navigation

Aura manages `aria-current`, but does not move focus when a new view commits. When an SPA navigation should announce the new page to keyboard or screen-reader users, use a `ready` hook to focus an appropriate heading or main-content container.

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

`prefetch()` prepares a route without changing the current URL. It returns when the prefetch work settles; see [Prefetch](#prefetch) for modes and safeguards.

### Invalidate, refresh, and fallback

```ts
router.invalidate({ cache?, key?, path?, match?, policy? }?): number
router.refreshRoutes(): void
router.setNotFoundHandler(handler | null): void
```

`invalidate()` returns the number of affected entries and defaults to the data cache with the stale policy. Its optional `match` field is a cache-key predicate; prefer `path` for normal route-level invalidation.

`refreshRoutes()` rebuilds matching from all descendant `<aura-route>` elements after route markup is added, removed, or reordered.

`setNotFoundHandler()` sets an instance-level fallback; pass `null` to clear it. See [Custom 404 handling](#custom-404-handling) for precedence.

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

- [README](../README.md) – quick start and project links
- [Recipes](./recipes/README.md) – auth, nested routes, cache, 404, and first paint
- [Known limitations](../LIMITATIONS.md)
- [Security policy](../SECURITY.md)
- [Roadmap](../ROADMAP.md)
- [Changelog](../CHANGELOG.md)

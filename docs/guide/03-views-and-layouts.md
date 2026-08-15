# Chapter 3 — Views and layouts

Load route content, extract regions from complete pages, and preserve shared layouts.

[← Routes and navigation](./02-routes-and-navigation.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./04-lifecycle-and-data.md)

---

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

Before the loader runs, Aura resolves `:name` tokens and optional search templates in `view` content. Tokens resolve from path params and query (`params` win on name collision). Unknown tokens stay unchanged.

```html
<aura-route path="/users/:id" view="users/:id.html"></aura-route>
```

For `/users/42`, Aura loads `users/42.html`.

### Search on `view` (not on `path`)

Matching still uses pathname only. To include the current query string when fetching a `url` view:

```html
<!-- Forward the full current search (MPA-style) -->
<aura-route
  path="/catalog/item.html"
  view="/catalog/item.html?*">
</aura-route>

<!-- Allowlist / remap selected keys from params ∪ query (utm and other keys are omitted) -->
<aura-route
  path="/catalog/item.html"
  view="/catalog/item.html?id=:id&tag=:tag">
</aura-route>
```

- `view="…?*"` appends the match's raw `search` (`?…`). An empty search yields no `?`.
- `view="…?id=:id&tag=:tag"` builds only `key=:token` pairs; missing or empty values are omitted. Remap works (`itemId=:id`).
- Use either `?*` or an allowlist, not both. Do not put `?` or `#` in `path`.

Hooks still see the full parsed query on `ctx.to.query` whether or not `view` forwards search.

Treat route attributes as trusted application configuration. Aura does not sanitise inline or fetched HTML, or allow-list `url` and `iframe` targets. Never build a `view` value from untrusted input; see [SECURITY.md](../../SECURITY.md).

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

If the selector does not match, Aura warns and falls back to the full response. Set `extract` to `none`, `off`, `false`, or an empty value to disable an inherited selector. On a flat initial route, the same selector also enables [first-paint adoption](./05-mpa-to-spa.md#first-paint-mpa--spa).

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

For the server-rendered HTML required when a nested URL loads directly, see [First paint](./05-mpa-to-spa.md#first-paint-mpa--spa).

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

---

[← Routes and navigation](./02-routes-and-navigation.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./04-lifecycle-and-data.md)

# Chapter 2 — Routes and navigation

Define route patterns, upgrade links, resolve URLs, and handle redirects.

[← Fundamentals](./01-fundamentals.md) · [Guide index](../guide.md) · [Views and layouts →](./03-views-and-layouts.md)

---

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

`path` is pathname only. Do not put `?` or `#` in `path` — matching ignores search and hash, and Aura warns when they appear. Pass query on the URL when navigating; read it in hooks from `ctx.to.query`. To forward search into resolved `view` content, use the forms in [Search on `view`](./03-views-and-layouts.md#search-on-view-not-on-path).

## Navigation

Mark only the links that Aura should intercept.

Use the `data-aura-link` attribute as the default marker for such links:
```html
<a href="/users/42?tab=profile" data-aura-link>User</a>
```
You can customize which links are processed by configuring the `links-selector` in `<aura-router>`. For example, to use a different attribute:
```html
<aura-router links-selector="[data-spa-link]"></aura-router>
```
Or to handle all anchor tags on the page:
```html
<aura-router links-selector="a"></aura-router>
```
**Warning:** In this mode, every intercepted link must have a corresponding route defined in the router configuration. Failing to define a route for a URL will result in a 404 error, even if the page exists on the server.

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

`navigate()` currently does not accept a `{ pathname, query, hash }` target object; that overload is [planned](../../ROADMAP.md#phase-5--developer-facing-api). Routes also do not declare query schemas. Inside hooks, read the parsed values from `ctx.to.query`.

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

---

[← Fundamentals](./01-fundamentals.md) · [Guide index](../guide.md) · [Views and layouts →](./03-views-and-layouts.md)

# Recipe: Nested layout + outlet

> **Goal:** Keep shared chrome mounted while sibling pages swap in `<aura-outlet>`.  
> **Live:** [`playground/`](../../playground/) — `/users` ↔ `/users/1` ↔ `/users/2`.  
> **API:** [Nested routes & layouts](../guide/03-views-and-layouts.md#nested-routes--layouts) · [Same-route updates](../guide/03-views-and-layouts.md#same-route-updates)

## Routes

```html
<aura-route path="/users/" layout="users">
  <aura-route path="." view="users"></aura-route>
  <aura-route path=":id" view="users/:id"></aura-route>
</aura-route>

<template id="users">
  <section class="layout">
    <h2>Users</h2>
    <aura-outlet></aura-outlet>
  </section>
</template>
```

The layout remains mounted while navigation stays inside `/users`; only the child view changes.

- `path="."` is the `/users` index.
- `path=":id"` matches `/users/1`, `/users/2`, and so on.
- `view="users/:id"` substitutes the matched id before fetching the view.

## Links

```html
<a href="/users/1" aura-router-link>User 1</a>
<a href="/users/2" aura-router-link>User 2</a>
```

Because the resolved view URL changes with `:id`, moving from `/users/1` to `/users/2` remounts the child; any `ready` hook runs again. Use a stable view plus `update` when the same mounted shell should handle every id.

## See also

- [Recipes index](./README.md)
- [`router.html`](../../playground/pages/parts/router.html) · [`users.html`](../../playground/pages/users.html)
- [Auth](./auth.md) — nested + `guard`
- Guide: [Nested routes & layouts](../guide/03-views-and-layouts.md#nested-routes--layouts)

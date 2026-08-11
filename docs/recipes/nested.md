# Recipe: Nested layout + outlet

> **Goal:** Keep shared chrome mounted while sibling pages swap in `<aura-outlet>`.  
> **Live:** [`playground/`](../../playground/) — `/users` ↔ `/users/1` ↔ `/users/2`.  
> **API:** [Nested routes & layouts](../guide.md#nested-routes--layouts) · [Same-route updates](../guide.md#same-route-updates)

---

## Result

```text
/users      → layout + list (path=".")
/users/:id  → same layout + detail in the outlet
```

The parent layout remains mounted while navigation stays inside `/users`. Moving between the list and user details replaces only the child view inside its outlet.

---

## 1. Define the route branch

```html
<aura-route path="/users/" layout="users">
  <aura-route path="." view="users"></aura-route>
  <aura-route path=":id" view="users/:id" ready="show-user"></aura-route>
</aura-route>

<template id="users">
  <section class="layout">
    <h2>Users</h2>
    <aura-outlet></aura-outlet>
  </section>
</template>
```

| Piece | Role |
| --- | --- |
| `layout="users"` | Chrome; must contain `<aura-outlet>` |
| `path="."` | Folder index (`/users`) |
| `path=":id"` | → `/users/:id` |
| `view="users/:id"` | Fetch `/users/1`, `/users/2`, and so on |

The parent pattern `/users/` and browser URL `/users` refer to the same folder index.

---

## 2. Handle a changed `:id`

Because `view="users/:id"` resolves to a different URL for every id, `/users/1` → `/users/2` runs `unmount`, renders the new child view, and then runs `ready`. The parent layout remains mounted and the in-place `update` hook is not used:

```js
import { AuraRouter } from '@auraui/router';

AuraRouter.use('show-user', (ctx) => {
  console.log(`User id: ${ctx.to.params?.id}`);
});
```

Use `update` instead when every id shares one stable view, such as `view="user-shell.html"`, and the hook updates that mounted shell with new params or load data.

Playground uses `ready="show-user"` on `:id` — check the console when switching User 1 ↔ User 2.

---

## 3. Link to child routes

```html
<a href="/users/1" aura-router-link>User 1</a>
<a href="/users/2" aura-router-link>User 2</a>
```

Root-absolute links such as `/users/1` are the clearest option. See [How `href` resolves](../guide.md#how-href-resolves) when the app needs document-relative or same-origin absolute links.

---

## Try it

Complete the [one-time playground setup](./README.md#one-time-playground-setup) first.

```bash
cd playground
npm run dev
```

1. `/users` — list inside the layout.
2. **User 1** — layout stays; detail loads (~2s on a cold fetch).
3. **User 2** — layout stays; leaf remounts; `ready` / `show-user` runs (console).
4. Back to `/users` — layout still there.

---

## See also

- [Recipes index](./README.md)
- [`router.html`](../../playground/pages/parts/router.html) · [`users.html`](../../playground/pages/users.html)
- [Auth](./auth.md) — nested + `guard`
- Guide: [Nested routes & layouts](../guide.md#nested-routes--layouts)

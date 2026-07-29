# Recipe: Nested layout + outlet

> **Goal:** Keep a shared chrome mounted while sibling pages swap inside `<aura-outlet>`.  
> **Live:** [`playground/`](../../playground/) — `/users` ↔ `/users/1` ↔ `/users/2`.  
> **API:** [Nested routes & layouts](../guide.md#nested-routes--layouts) · [Lifecycle hooks](../guide.md#lifecycle-hooks)

---

## What you get

```text
/users      → layout + list (path=".")
/users/:id  → same layout + detail in the outlet
```

The `users` layout stays mounted. Only the outlet content changes. Prefer **root-absolute** links (`/users/1`) so they work with and without JS.

---

## 1. Routes

```html
<aura-route path="/users/" layout="users" extract=".main">
  <aura-route path="." view="users"></aura-route>
  <aura-route path=":id"
              view="users/{{id}}"
              ready="show-user"
              update="show-user"></aura-route>
</aura-route>

<template id="users">
  <section class="layout">
    <h2>Users</h2>
    <p class="hint">Layout stays mounted across /users ↔ /users/:id</p>
    <aura-outlet></aura-outlet>
  </section>
</template>
```

| Piece | Role |
| --- | --- |
| `layout="users"` | Shared chrome; must contain `<aura-outlet>` |
| `path="."` | Section home — same URL as the folder |
| `path=":id"` | Child segment → `/users/:id` |
| `view="users/{{id}}"` | URL loader; `{{id}}` filled from params (`users/1`, …) |
| `ready` + `update` | Effects on enter **and** on `:id` change without full remount |

Playground also sets `cache` / `cache-time` on this tree — see [Prefetch & cache](./prefetch-cache.md).

---

## 2. Param change hook (optional)

When `/users/1` → `/users/2` keeps the same leaf route, use `update` (not only `ready`):

```js
import { AuraRouter } from '@auraui/router';

AuraRouter.use('show-user', async (ctx) => {
  console.log(`User id: ${ctx.to.params?.id}`);
});

AuraRouter.install();
```

---

## 3. Links inside the tree

```html
<ul>
  <li><a href="/users/1" aura-router-link>User 1</a></li>
  <li><a href="/users/2" aura-router-link>User 2</a></li>
</ul>
```

Avoid path-relative `href="1"` from `/users` unless you control trailing slashes — see [How `href` resolves](../guide.md#how-href-resolves).

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Open `/users` — list inside the layout.
2. Click **User 1** — layout stays; outlet shows the detail (server delay ~3s on a cold fetch).
3. Click **User 2** — same layout; `update="show-user"` runs for the new `:id`.
4. Back to `/users` — layout still there; list returns in the outlet.

---

## See also

- Routes: [`playground/pages/parts/router.html`](../../playground/pages/parts/router.html)
- List / detail HTML: [`users.html`](../../playground/pages/users.html), [`user.html`](../../playground/pages/user.html)
- [Auth recipe](./auth.md) — nested layout + `guard` on a parent
- Guide: [Nested routes & layouts](../guide.md#nested-routes--layouts)

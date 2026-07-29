# Recipe: Nested layout + outlet

> **Goal:** Keep shared chrome mounted while sibling pages swap in `<aura-outlet>`.  
> **Live:** [`playground/`](../../playground/) — `/users` ↔ `/users/1` ↔ `/users/2`.  
> **API:** [Nested routes & layouts](../guide.md#nested-routes--layouts) · [Lifecycle hooks](../guide.md#lifecycle-hooks)

---

## What you get

```text
/users      → layout + list (path=".")
/users/:id  → same layout + detail in the outlet
```

Prefer root-absolute links (`/users/1`). Route `path="/users/"` and URL `/users` match the same folder index.

---

## 1. Routes

```html
<aura-route path="/users/" layout="users">
  <aura-route path="." view="users"></aura-route>
  <aura-route path=":id" view="users/{{id}}" ready="show-user"></aura-route>
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
| `view="users/{{id}}"` | URL loader; `{{id}}` from params → fetch `/users/1`, … |

---

## 2. `:id` change and hooks

With **per-id** `view` (`users/{{id}}`), `/users/1` → `/users/2` **remounts** the leaf (new view URL / `viewKey`). Lifecycle: `ready` again — **not** `update`.

```js
AuraRouter.use('show-user', (ctx) => {
  console.log(`User id: ${ctx.to.params?.id}`);
});
```

Use `update` only when the view key stays the same (same shell HTML, params/query change), e.g. stable `view="user-shell.html"` + data from `load` / params. See guide lifecycle table.

Playground uses `ready="show-user"` on `:id` — check the console when switching User 1 ↔ User 2.

---

## 3. Links

```html
<a href="/users/1" aura-router-link>User 1</a>
<a href="/users/2" aura-router-link>User 2</a>
```

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. `/users` — list inside the layout.
2. **User 1** — layout stays; detail loads (~3s on a cold fetch).
3. **User 2** — layout stays; leaf remounts; `ready` / `show-user` runs (console).
4. Back to `/users` — layout still there.

---

## See also

- [`router.html`](../../playground/pages/parts/router.html) · [`users.html`](../../playground/pages/users.html)
- [Auth](./auth.md) — nested + `guard`
- Guide: [Nested routes & layouts](../guide.md#nested-routes--layouts)

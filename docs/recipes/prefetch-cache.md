# Recipe: Prefetch & cache

> **Goal:** Prepare links before navigation, retain reusable work, and disable durable caching where content should not be kept.
> **Live:** [`playground/`](../../playground/) — compare durable caching on `/contacts` and `/users/1`.
> **API:** [Prefetch](../guide/06-navigation-ux.md#prefetch) · [Cache](../guide/06-navigation-ux.md#cache)

## Configuration

```html
<aura-router extract=".main" prefetch="intent" cache cache-time="15">
  <aura-route path="/contacts" view="contacts" cache="off"></aura-route>

  <aura-route path="/users/" layout="users" cache-time="10">
    <aura-route path="." view="users"></aura-route>
    <aura-route path=":id" view="users/:id"></aura-route>
  </aura-route>
</aura-router>

<a href="/contacts" aura-router-link data-prefetch="tap">Contacts</a>
<a href="/users/1" aura-router-link>User 1</a>
```

The router provides defaults; child routes and links only declare overrides.

- `intent` prepares `load` data after hover or keyboard focus. It does not preload the view.
- `data-prefetch="tap"` prepares both data and view on pointer down.
- Bare `cache` retains view payloads and `load` data, but not mounted DOM.
- `cache-time` is the lifetime in seconds.
- `cache="off"` disables durable caching for `/contacts`.

Aura may still reuse recent work through a short handoff buffer even when durable caching is off.

## Invalidate after a mutation

```js
document.querySelector('aura-router')?.invalidate({ cache: 'view' });
```

Use invalidation when cached content becomes stale. The [guide](../guide/06-navigation-ux.md#invalidate-cached-entries) covers data, path, key, and removal options.

## See also

- [Recipes index](./README.md)
- [`router.html`](../../playground/pages/parts/router.html) · [`server.js`](../../playground/server.js) delays
- Guide: [Cache](../guide/06-navigation-ux.md#cache)

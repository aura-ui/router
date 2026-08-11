# Recipe: Prefetch & cache

> **Goal:** Prepare links before navigation, retain reusable work, and disable durable caching where content should not be kept.
> **Live:** [`playground/`](../../playground/) — compare durable caching on `/contacts` and `/users/1`.
> **API:** [Prefetch](../guide.md#prefetch) · [Cache](../guide.md#cache)

---

## Result

```text
<aura-router prefetch="intent" cache cache-time="15">  → shared defaults
/contacts   cache="off"                                → no durable cache
/users/…    cache-time="10"                            → shorter cache lifetime
```

The bare `cache` attribute retains view payloads and `load` data. Set the prefetch mode explicitly; `prefetch="true"` is accepted as an alias for `intent`.

`intent` prepares route `load` data after hover or keyboard focus. It does not preload a view payload by itself. Use `tap` or `manual` when the view should also be prepared.

---

## 1. Set defaults and overrides

```html
<aura-router extract=".main" prefetch="intent" cache cache-time="15">
  <aura-route path="/contacts" view="contacts" cache="off"></aura-route>

  <aura-route path="/users/" layout="users" cache-time="10">
    <aura-route path="." view="users"></aura-route>
    <aura-route path=":id" view="users/:id"></aura-route>
  </aura-route>
</aura-router>
```

| Attr | Meaning |
| --- | --- |
| `prefetch="intent"` | Prepare route `load` data after pointer or keyboard focus indicates interest |
| `data-prefetch="tap"` | Override one link and prepare its data and view on pointer down |
| `cache` (bare) | Cache **view** HTML and **`load` data** (no DOM keep-alive) |
| `cache-time` | Long-cache TTL in **seconds** |
| `cache="off"` | Opt out of inherited cache |

`extract`, `prefetch`, `cache`, and `cache-time` inherit. A child route only needs to declare values that differ from its parent.

## 2. Mark links for Aura

```html
<a href="/contacts" aura-router-link data-prefetch="tap">Contacts</a>
<a href="/users/1" aura-router-link>User 1</a>
```

The Contacts link explicitly overrides the inherited `intent` policy. `tap` is useful here because the route has a view payload but no `load` hook, so `intent` alone would have nothing to prepare. Prefetch does not navigate or display loading UI.

## 3. Invalidate when data changes

```js
document.querySelector('aura-router')?.invalidate({ cache: 'view' });
```

Use invalidation after a mutation makes cached content stale. See [Invalidate cached entries](../guide.md#invalidate-cached-entries) for data, path, key, and removal options.

`cache="off"` disables durable caching, but Aura may still reuse recent prepare work through its short handoff buffer of about 30 seconds.

For visible loading state, prefer `loading-body-class` or loading events. The playground still demonstrates `loading-template`, but that option is experimental; see [Loading](../guide.md#loading).

---

## Try it

Complete the [one-time playground setup](./README.md#one-time-playground-setup) first.

```bash
cd playground
npm run dev
```

1. The unmodified playground uses `intent` and has no route `load` hooks, so hover alone does not fetch its views.
2. Add `data-prefetch="tap"` as shown above to observe Contacts view preparation on pointer down.
3. Contacts has no durable cache; a revisit may still reuse the short handoff buffer, but fetches again after that buffer expires.
4. Open `/users/1`, navigate away, then return within about 10 seconds — the retained view payload is reused.
5. Open `/users/2` — its different pathname creates a separate cache entry.

---

## See also

- [Recipes index](./README.md)
- [`router.html`](../../playground/pages/parts/router.html) · [`server.js`](../../playground/server.js) delays
- Guide: [Cache](../guide.md#cache)

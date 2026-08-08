# Recipe: Prefetch & cache

> **Goal:** Warm links on hover; cache HTML; turn cache off when every visit must refetch.  
> **Live:** [`playground/`](../../playground/) — hover nav, then `/contacts` vs `/users/1`.  
> **API:** [Cache](../guide.md#cache) · [Router defaults](../guide.md#router-defaults)

---

## What you get

```text
<aura-router prefetch="true" cache cache-time="15">  → tree defaults
/contacts   cache="off"                              → always network (~1s in playground)
/users/…    cache-time="10"                          → shorter TTL (still inherits cache mode)
```

Bare `cache` is valid (view + `load` data). Bare `prefetch` is **not** — use `prefetch="true"` or `prefetch="intent"`.

---

## Routes

```html
<aura-router extract=".main" prefetch="true" cache cache-time="15">
  <aura-route path="/contacts" view="contacts" cache="off"></aura-route>

  <aura-route path="/users/" layout="users" cache-time="10">
    <aura-route path="." view="users"></aura-route>
    <aura-route path=":id" view="users/:id"></aura-route>
  </aura-route>
</aura-router>
```

| Attr | Meaning |
| --- | --- |
| `prefetch="true"` | Same as `intent` — hover / focus warmup on `[aura-router-link]` |
| `cache` (bare) | Cache **view** HTML and **`load` data** (no DOM keep-alive) |
| `cache-time` | Long-cache TTL in **seconds** |
| `cache="off"` | Opt out of inherited cache |

`extract` / `cache` / `cache-time` inherit. On a child, set only what you override (`cache="off"`, `cache-time="10"`). Skeleton UI while fetching is separate — see [Loading](../guide.md#loading) (playground uses `loading-template`).

```html
<a href="/contacts" aura-router-link>Contacts</a>
<a href="/users/1" aura-router-link>User 1</a>
```

Optional: `document.querySelector('aura-router')?.invalidate({ cache: 'view' })` — [guide](../guide.md#invalidate-from-code).

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Hover **Contacts**, then click — still ~1s every time (`cache="off"`).
2. Open `/users/1` once (~3s cold), navigate away, return within ~10s — view cache hit.
3. `/users/2` — different URL → separate cache entry.

---

## See also

- [`router.html`](../../playground/pages/parts/router.html) · [`server.js`](../../playground/server.js) delays
- Guide: [Cache](../guide.md#cache)

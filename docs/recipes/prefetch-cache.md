# Recipe: Prefetch & cache

> **Goal:** Warm the next page on link intent, keep HTML for a TTL, and opt out when a route must always refetch.  
> **Live:** [`playground/`](../../playground/) — hover nav links, then `/contacts` vs `/users/1`.  
> **API:** [Cache](../guide.md#cache) · [Loading](../guide.md#loading) · [Router defaults](../guide.md#router-defaults)

---

## What you get

```text
<aura-router prefetch cache cache-time="…">  → defaults for the tree
/contacts   cache="off"   → always fetch (delay visible every time)
/users/…    cache + TTL   → second visit can reuse cached HTML
```

Prefetch runs from `[aura-router-link]` on **mouseover / focusin** (and touch for tap mode). Cache stores the **view payload** (fetched HTML); this recipe does not need a `load` hook.

---

## 1. Router defaults + routes

```html
<aura-router extract=".main"
             prefetch="true"
             cache
             cache-time="15"
             loading-template="loading">

  <aura-route path="/contacts"
              view="contacts"
              extract=".main"
              cache="off"
              loading-template="loading-contacts"></aura-route>

  <aura-route path="/users/" layout="users" extract=".main" cache cache-time="10">
    <aura-route path="." view="users"></aura-route>
    <aura-route path=":id" view="users/{{id}}"></aura-route>
  </aura-route>

</aura-router>

<template id="loading"><h1>Loading…</h1></template>
<template id="loading-contacts"><h1>Loading contacts…</h1></template>
```

| Attr | Meaning |
| --- | --- |
| `prefetch="true"` | Same as `prefetch="intent"` — hover/focus warmup (also: `tap`, `false`) |
| `cache` | Cache view (+ `load` data if any); remount UI on revisit |
| `cache-time="15"` | TTL in **seconds** → long-cache `gcTime` (inherit / override per route) |
| `cache="off"` | Opt out of inherited cache — always network |
| `loading-template` | Placeholder while the view is fetching |

Attrs inherit down the tree; a child can override or opt out (`off` / `none` / `false`).

---

## 2. Links

```html
<a href="/contacts" aura-router-link>Contacts</a>
<a href="/users/1" aura-router-link>User 1</a>
```

No extra attributes required when the router has prefetch enabled. Per-link override: `data-prefetch` on the `<a>` (`intent` / `tap` / `false`, …).

---

## 3. Invalidate (optional)

```js
const router = document.querySelector('aura-router');
router?.invalidate({ cache: 'view' }); // drop cached HTML; navigate again to refetch
```

Does not remount the current page. See [Cache → Invalidate](../guide.md#invalidate-from-code).

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Hover **Contacts**, then click — may feel faster after prefetch; every visit still waits ~1s (`cache="off"`).
2. Open `/users/1` once (~3s server delay), navigate away, return within ~10s — second load should hit view cache.
3. Compare with `/users/2` — different URL → separate cache entry.
4. Watch the loading templates while a cold fetch is in flight.

---

## See also

- Routes: [`playground/pages/parts/router.html`](../../playground/pages/parts/router.html)
- Slow pages: [`contacts.html`](../../playground/pages/contacts.html), [`server.js`](../../playground/server.js) delays
- Guide: [Cache](../guide.md#cache) · [Loading](../guide.md#loading)

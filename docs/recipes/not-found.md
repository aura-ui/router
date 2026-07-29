# Recipe: 404 & navigation errors

> **Goal:** Show a dedicated not-found page for unknown URLs, and a fallback UI when navigation fails.  
> **Live:** [`playground/`](../../playground/) — click **404 — path="*"** in the nav (SPA to `/error`).  
> **API:** [Navigation](../guide.md#navigation) · [Router defaults](../guide.md#router-defaults) · [Lifecycle hooks](../guide.md#lifecycle-hooks)

---

## What you get

```text
Unknown URL            → path="*" catch-all view (+ `not-found` event, source: route)
No match and no `*`    → `error-template` fallback (+ cancelable `not-found`, source: fallback)
Pipeline / render fail → `error-template` on <aura-router>
Hook-level recovery    → error="…" on a route (optional)
```

`path="*"` is a normal route at the end of the tree. Prefer it for a real 404 page. `error-template` covers render/navigation failures and is only a thin 404 fallback when there is no catch-all.

---

## 1. Catch-all 404

```html
<aura-router error-template="error">
  <aura-route path="/" view="html::<h1>Home</h1>"></aura-route>
  <aura-route path="/about" view="template::about-page"></aura-route>

  <!-- last: unmatched URLs -->
  <aura-route path="*" view="template::not-found"></aura-route>
</aura-router>

<template id="about-page">
  <h1>About</h1>
</template>

<template id="not-found">
  <h1>404</h1>
  <p>No route matched (path="*").</p>
  <p><a href="/" aura-router-link>Home</a></p>
</template>

<template id="error">
  <h1>Something went wrong</h1>
  <p>Navigation or render failed.</p>
</template>
```

| Mechanism | When |
| --- | --- |
| `path="*"` | URL matched no earlier route → render this view; emits `not-found` with `source: 'route'` |
| `error-template` | Render/navigation failure; also fallback 404 UI when there is **no** `path="*"` |
| `error="hook-name"` | Route-level hook for recovery / reporting (see guide) |

Put `path="*"` **after** real routes so it does not swallow them.

> **Playground note:** a hard reload of `/error` hits the server catch-all and returns `index.html`. Use the **nav link** (client navigation) to see `template::not-found`.

---

## 2. Listen (optional)

```js
document.querySelector('aura-router')?.addEventListener('not-found', (e) => {
  console.log('not-found', e.detail?.url, e.detail?.source);
});

document.querySelector('aura-router')?.addEventListener('navigation-error', (e) => {
  console.log('navigation-error', e.detail?.code, e.detail?.error);
});
```

Event names on `<aura-router>` are experimental before `0.1.0` — see the [guide](../guide.md#programmatic-api).

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Click **404 — path="*"** in the nav → catch-all template (not a full page reload).
2. Confirm a real route like `/about` still works and is not caught by `*`.
3. (Optional) Force a bad `view` URL in a throwaway route to see `error-template`.

---

## See also

- Routes: [`playground/pages/parts/router.html`](../../playground/pages/parts/router.html)
- Guide: [Navigation](../guide.md#navigation) · [Router defaults](../guide.md#router-defaults)

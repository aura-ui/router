# Recipe: 404 & navigation errors

> **Goal:** Unknown URLs get a catch-all page; navigation/render failures get a fallback template.  
> **Live:** [`playground/`](../../playground/) — click **404** in the nav (client SPA to `/error`).  
> **API:** [Navigation](../guide.md#navigation) · [Router defaults](../guide.md#router-defaults)

---

## What you get

```text
No matching route     → path="*" view  (+ not-found event, source: "route")
Navigation/render fail → error-template on <aura-router>
No path="*" at all    → error-template can also act as thin 404 fallback
```

Prefer `path="*"` for a dedicated 404 page. Keep `error-template` for real failures.

---

## Routes

```html
<aura-router error-template="error">
  <aura-route path="/" view="html::<h1>Home</h1>"></aura-route>
  <aura-route path="/about" view="template::about-page"></aura-route>
  <aura-route path="*" view="template::not-found"></aura-route>
</aura-router>

<template id="about-page"><h1>About</h1></template>

<template id="not-found">
  <h1>404</h1>
  <p><a href="/" aura-router-link>Home</a></p>
</template>

<template id="error"><h1>Error</h1></template>
```

Put `path="*"` **last** so it does not swallow real routes.

> **Playground:** the nav link `/error` is handled in the client by `path="*"`. A **hard reload** of `/error` hits the server `/*` handler and returns `index.html` — use the nav link, not a full reload.

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Click **404** in the nav → `template::not-found` (no full page reload).
2. Open `/about` — still the About route, not `*`.

---

## See also

- [`router.html`](../../playground/pages/parts/router.html)
- Guide: [Navigation](../guide.md#navigation)

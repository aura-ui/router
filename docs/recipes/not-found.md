# Recipe: Not found & navigation errors

> **Goal:** Unknown URLs get a catch-all page; navigation/render failures get a fallback template.  
> **Live:** [`playground/`](../../playground/) — click **404** in the nav (client SPA to `/error`).  
> **API:** [Not found (404)](../guide.md#not-found-404) · [Navigation errors](../guide.md#navigation-errors)

---

## Result

```text
Unknown application URL → catch-all path="*" route
View-loader/render failure → error-template
Guard/load/hook failure → error hook (if configured) + navigation-error event
No catch-all route → fallback chain, then error-template
```

Prefer `path="*"` for a dedicated 404 page. Keep `error-template` for real failures.

---

## 1. Add a catch-all route

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

The catch-all has lower match priority than specific routes, so `/about` still selects the About page. A committed catch-all dispatches an informational, non-cancelable `not-found` event with `source: 'route'`.

## 2. Provide failure UI

`error-template="error"` provides recovery markup when the route view cannot be loaded or rendered. It is also the final templated fallback when no catch-all or custom not-found handler handles an unknown URL.

Other navigation failures, such as a thrown guard or `load` hook, run inherited `error` hooks and emit `navigation-error`; they do not automatically mount `error-template`.

When no route matches, Aura first dispatches the cancelable `not-found` event with `source: 'fallback'`. If it is not prevented, Aura tries the instance handler, global handler, `error-template`, and finally plain text in that order. See [Custom 404 handling](../guide.md#custom-404-handling).

`error-template` is one fallback template, not a nested error-boundary tree.

---

## Try it

Complete the [one-time playground setup](./README.md#one-time-playground-setup) first.

```bash
cd playground
npm run dev
```

1. Click **404** in the nav → `template::not-found` renders without a full reload.
2. Open `/about` → the specific About route wins over `*`.

---

## See also

- [Recipes index](./README.md)
- [`router.html`](../../playground/pages/parts/router.html)
- Guide: [Not found (404)](../guide.md#not-found-404) · [Navigation errors](../guide.md#navigation-errors)

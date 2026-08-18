# Recipe: Not found & navigation errors

> **Goal:** Unknown URLs get a catch-all page; view loading and rendering failures get fallback markup.
> **Live:** [`playground/`](../../playground/) — click **404** in the nav (client SPA to `/error`).  
> **API:** [Not found (404)](../guide/08-errors-and-accessibility.md#not-found-404) · [Navigation errors](../guide/08-errors-and-accessibility.md#navigation-errors)

## Routes and templates

```html
<aura-router error-template="error">
  <aura-route path="/" view="html::<h1>Home</h1>"></aura-route>
  <aura-route path="*" view="template::not-found"></aura-route>
</aura-router>

<template id="not-found">
  <h1>404</h1>
  <p><a href="/" aura-router-link>Home</a></p>
</template>

<template id="error"><h1>Error</h1></template>
```

Use the two templates for different jobs:

- `path="*"` is the normal application 404 page. Specific routes have higher priority.
- `error-template` recovers a view that fails to load or render. It is also the final templated fallback when no route matches.
- Guard and `load` failures run `error` hooks and emit `navigation-error`; they do not automatically mount `error-template`.

For custom unmatched-URL handling, use `router.setNotFoundHandler()` or the cancelable fallback `not-found` event. See [Custom 404 handling](../guide/08-errors-and-accessibility.md#custom-404-handling) for the precedence.

## See also

- [Recipes index](./README.md)
- [`router.html`](../../playground/pages/parts/router.html)
- Guide: [Not found (404)](../guide/08-errors-and-accessibility.md#not-found-404) · [Navigation errors](../guide/08-errors-and-accessibility.md#navigation-errors)

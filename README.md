# Aura Router

[![npm version](https://img.shields.io/npm/v/@auraui/router.svg)](https://www.npmjs.com/package/@auraui/router)
[![CI](https://github.com/aura-ui/router/actions/workflows/ci.yml/badge.svg)](https://github.com/aura-ui/router/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/badge/minzip-33.2%20kB-blue)](https://bundlephobia.com/package/@auraui/router)
[![license](https://img.shields.io/npm/l/@auraui/router.svg)](./LICENSE)

**Keep the HTML. Upgrade the navigation.**

Aura Router adds client-side navigation to complete static or server-rendered HTML pages – with nested layouts, route lifecycle hooks, and no framework adapter.

Your host keeps serving real pages. Aura adopts the HTML already on screen and upgrades marked links after load.

```bash
npm install @auraui/router
```

[Quick start](#quick-start) · [Demo source](https://github.com/aura-ui/router-preview) · [Guide](./docs/guide.md) · [Recipes](./docs/recipes/)

## Why Aura Router?

- **Keep your pages.** Every URL can return useful HTML before Aura runs.
- **Add SPA navigation.** Mark existing links and update only the view regions affected by the new route.
- **Grow without a rewrite.** Add nested layouts, lifecycle hooks, prefetching, and caching when you need them.

Works with plain HTML, Web Components, and Lit. Your backend or static host keeps rendering complete pages.

## How it works

1. The browser requests a normal URL.
2. Your host returns a complete HTML page.
3. Aura adopts the content already on screen.
4. Marked same-origin links use client navigation from then on.

> **MPA first. SPA when ready.**

## Quick start

**1. Keep the page you already have**

```html
<main id="content">
  <h1>Home</h1>
</main>
```

Serve a complete page for every URL and keep the same selector around the content you want Aura to update.

**2. Declare routes. Mark the links.**

```html
<a href="/about/" aura-router-link>About</a>

<aura-outlet></aura-outlet>
<aura-router extract="#content">
  <aura-route path="/" view="/"></aura-route>
  <aura-route path="/about/" view="/about/"></aura-route>
</aura-router>
```

`extract` tells Aura which region to take from each complete HTML response. On the first flat page, Aura adopts the matching region already on screen instead of fetching it again.

**3. Start Aura once**

```js
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

That is the upgrade: every URL still opens as a normal page, while marked links navigate through Aura after startup.

## Change the page. Keep the layout.

Nested routes keep shared UI mounted while the child view changes – useful for dashboards, workspaces, and settings screens.

```html
<aura-router extract="#content">
  <aura-route path="/workspace/" layout="workspace-shell">
    <aura-route path="." view="/workspace/"></aura-route>
    <aura-route path="settings" view="/workspace/settings/"></aura-route>
  </aura-route>
</aura-router>

<template id="workspace-shell">
  <nav><!-- durable chrome --></nav>
  <aura-outlet></aura-outlet>
</template>
```

Direct nested URLs need matching outlet-shaped HTML and an `aura-router-ssr` marker. See the [nested layout recipe](./docs/recipes/nested.md).

## Add features when you need them

- [Lifecycle hooks](./docs/guide/04-lifecycle-and-data.md#lifecycle-hooks) – guard, load, ready, leave, and unmount
- [Prefetch and cache](./docs/recipes/prefetch-cache.md) – configure link prefetch and route-scoped view, data, or DOM cache policies
- [Authentication guards](./docs/recipes/auth.md) – protect client navigation without hiding server responsibilities
- [First-paint adoption](./docs/recipes/first-paint.md) – reuse flat or nested HTML on startup
- [404 handling](./docs/recipes/not-found.md) – keep client and server fallbacks honest
- [Programmatic navigation](./docs/guide/08-api-reference.md#programmatic-api) – navigate from application code

## Compatibility

Aura Router targets modern browsers with ES modules, Custom Elements, History API, and `fetch`. Parameterized routes require `URLPattern`.

It runs in the browser; it is not a Node SSR runtime. Your server or static host remains in control of the HTML response.

## Project

Current release: **0.1.0**

**Documentation:** [Guide](./docs/guide.md) · [Recipes](./docs/recipes/) · [Playground](./playground/) · [Known limitations](./LIMITATIONS.md)

**Development:** [Changelog](./CHANGELOG.md) · [Roadmap](./ROADMAP.md) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)

**Community:** [GitHub Discussions](https://github.com/aura-ui/router/discussions) · [hello@aura-ui.dev](mailto:hello@aura-ui.dev) · [npm](https://www.npmjs.com/package/@auraui/router)

## License

MIT covers source code only – not the project name or logos. See [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

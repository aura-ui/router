# Aura Router

[![npm version](https://img.shields.io/npm/v/@auraui/router.svg)](https://www.npmjs.com/package/@auraui/router)
[![CI](https://github.com/aura-ui/router/actions/workflows/ci.yml/badge.svg)](https://github.com/aura-ui/router/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/badge/minzip-33.2%20kB-blue)](https://bundlephobia.com/package/@auraui/router)
[![license](https://img.shields.io/npm/l/@auraui/router.svg)](./LICENSE)

**HTML-first declarative router for Web Components with nested outlets and route lifecycle.** First visit renders a real HTML page; after `AuraRouter.install()`, in-app navigation updates content without a full reload (MPA→SPA).

```bash
npm install @auraui/router
```

## Why Aura Router

| | |
| --- | --- |
| **Routes in HTML** | `<aura-router>`, `<aura-route>`, `<aura-outlet>` — path, layout, view, hooks, and cache in markup |
| **Nested layouts** | Shared shell stays mounted; only the matched leaf updates in the outlet |
| **Route lifecycle** | `guard`, `load`, `ready`, `leave`, `unmount`, … — including client redirect chains |
| **Cache & prefetch** | Route-scoped `cache` (view / data / DOM); intent/tap prefetch on in-app links |
| **HTML-first, MPA → SPA** | First visit paints server HTML; later navigations update the outlet without a full reload |
| **SEO-friendly** | Crawlers and link previews read real HTML when the server renders the page — no empty client shell |
| **Progressive enhancement** | Root-absolute `href`s work without JS; `aura-router-link` upgrades them to client navigation |

Works with plain HTML, vanilla custom elements, or Lit. Load full server pages with `url` + `extract` when you need a fragment. See the [guide](./docs/guide.md).

## Quick start

**1. Install**

```ts
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

Or CDN (pin the version):

```html
<script type="module">
  import { AuraRouter } from 'https://esm.sh/@auraui/router@0.1.0';
  AuraRouter.install();
</script>
```

Registers `<aura-router>`, `<aura-route>`, and `<aura-outlet>`.

**2. Declare routes**

```html
<aura-router>
  <aura-route path="/" view="index.html"></aura-route>
  <aura-route path="/users" view="users.html"></aura-route>
  <aura-route path="/about" view="template::about-page"></aura-route>
  <aura-route path="*" view="template::not-found"></aura-route>
</aura-router>

<template id="about-page">
  <h1>About</h1>
  <p>Static markup or Web Components go here.</p>
</template>

<template id="not-found">
  <h1>404</h1>
</template>
```

Nested shell (layout stays mounted across children):

```html
<aura-router>
  <aura-route path="/app" layout="app-shell" guard="auth">
    <aura-route path="users" view="users.html" load="users"></aura-route>
    <aura-route path="settings" view="template::settings"></aura-route>
  </aura-route>
  <aura-route path="*" view="template::not-found"></aura-route>
</aura-router>

<template id="app-shell">
  <nav><!-- durable chrome --></nav>
  <aura-outlet></aura-outlet>
</template>

<template id="settings">
  <h1>Settings</h1>
</template>
```

`guard` / `load` are hook names from `AuraRouter.use` — see [lifecycle hooks](./docs/guide.md#lifecycle-hooks). A bare `view` file name (e.g. `users.html`) is fetched from the server after the first full load.

**3. Links**

```html
<a href="/" aura-router-link>Home</a>
<a href="/app/users" aura-router-link>Users</a>
```

Prefer root-absolute paths (`/users`). Aura matches `/users` and `/users/` as the same route and keeps the pathname as in the link. Same-origin absolute URLs (`https://your-host/…`) on `[aura-router-link]` also SPA-navigate; other origins keep a full page load — see [How `href` resolves](./docs/guide.md#how-href-resolves).

```ts
document.querySelector('aura-router')?.navigate('/app/users');
```

Playground: [`playground/`](./playground/). Recipes: [`docs/recipes/`](./docs/recipes/).

## Browsers

Modern evergreen browsers (Chrome, Firefox, Safari, Edge) with ES modules, Custom Elements, History API, `fetch`, and `URLPattern` (for `:param` routes).

No Internet Explorer. No Node SSR runtime — the router runs in the browser. See [LIMITATIONS](./LIMITATIONS.md).

## Docs

| | |
| --- | --- |
| **Usage guide** | [docs/guide.md](./docs/guide.md) |
| Questions / feedback | [GitHub Discussions](https://github.com/aura-ui/router/discussions) · [hello@aura-ui.dev](mailto:hello@aura-ui.dev) |
| Known gaps | [LIMITATIONS.md](./LIMITATIONS.md) |
| Security | [SECURITY.md](./SECURITY.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) |
| Changelog | [CHANGELOG.md](./CHANGELOG.md) |
| Contributing | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| npm | [@auraui/router](https://www.npmjs.com/package/@auraui/router) |

## Stability

Each version before `1.0.0` may include breaking changes — check the [CHANGELOG](./CHANGELOG.md). See [ROADMAP](./ROADMAP.md).

## License

MIT covers source code only — not the project name or logos. See [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

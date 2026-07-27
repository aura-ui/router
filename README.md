# Aura Router

[![npm version](https://img.shields.io/npm/v/@auraui/router.svg)](https://www.npmjs.com/package/@auraui/router)
[![CI](https://github.com/aura-ui/router/actions/workflows/ci.yml/badge.svg)](https://github.com/aura-ui/router/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@auraui/router.svg)](./LICENSE)

**Declarative routing for Web Components — HTML-first, MPA→SPA.**

First visit shows a normal HTML page. After `AuraRouter.install()`, in-app links update the page content without a full reload (SPA-style).

```bash
npm install @auraui/router
```

> **Experimental (pre-alpha).** `@auraui/router@0.0.1` may change before `0.1.0`. Pin exact versions; use for evaluation and feedback, not as a frozen production contract yet. See [ROADMAP](./ROADMAP.md) and [LIMITATIONS](./LIMITATIONS.md).

## Why Aura Router

A thin layer over real HTML — not a meta-framework. Keep pages on the server; add client navigation in the browser. Routes live in markup; UI can be plain HTML or Web Components.

| | |
| --- | --- |
| **Routes in HTML** | Declare `<aura-router>`, `<aura-route>`, `layout`, and `view` in markup instead of owning the app from a JS route table |
| **HTML-first, MPA → SPA** | Each URL is a full HTML page (router included). The first visit paints that document; later in-app navigations fetch HTML and update the outlet |
| **SEO-friendly** | Search engines and link previews can read real HTML when your server renders the page — no empty client shell required |
| **Web Components, no lock-in** | Works with vanilla custom elements, Lit, or existing HTML pages |
| **Nested layouts & lifecycle** | Nested outlets plus `guard`, `load`, `ready`, and cache — declared on the route |
| **Progressive enhancement** | Plain `href` links keep working without JavaScript; `aura-router-link` upgrades them to client navigation |
| **Legacy-friendly** | Load full server pages with the `url` view and take a fragment via `extract` |

## Quick start

**1. Install once**

```bash
npm install @auraui/router
```

```ts
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

Or without a bundler (CDN — pin the version):

```html
<script type="module">
  import { AuraRouter } from 'https://esm.sh/@auraui/router@0.0.1';
  AuraRouter.install();
</script>
```

This registers the custom elements: `<aura-router>`, `<aura-route>`, and `<aura-outlet>` (the place where page content appears).

**2. Declare routes in HTML**

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

If `view` is just a file name (e.g. `users.html`), Aura fetches that HTML from the server. That is the usual way to load pages after the first full page load.

**3. Add in-app links**

```html
<a href="/" aura-router-link>Home</a>
<a href="/users" aura-router-link>Users</a>
```

Clicks on `[aura-router-link]` update the URL and swap the outlet — no full reload.

Or navigate from code:

```ts
const router = document.querySelector('aura-router');
router?.navigate('/users');
router?.navigate('/users', { replace: true });
```

Try the local demo in [`demo-space/`](./demo-space) (`cd demo-space && npm install && npm run dev`) — scratch pad, not a reference app; it will change.

## Browsers

Modern evergreen browsers (Chrome, Firefox, Safari, Edge) with:

- ES modules
- Custom Elements
- History API (`pushState` / `popstate`)
- `fetch`
- `URLPattern` (required for `:param` routes)

No Internet Explorer. No Node SSR runtime — the router runs in the browser (HTML-first / MPA→SPA). See [LIMITATIONS](./LIMITATIONS.md).

## Docs

| | |
| --- | --- |
| **Usage guide** | [docs/guide.md](./docs/guide.md) — navigation, views, layouts, lifecycle, cache, loading, API |
| Known gaps | [LIMITATIONS.md](./LIMITATIONS.md) |
| Security | [SECURITY.md](./SECURITY.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) |
| Changelog | [CHANGELOG.md](./CHANGELOG.md) |
| Contributing | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| npm | [@auraui/router](https://www.npmjs.com/package/@auraui/router) |

## License

MIT covers source code only — not the project name or logos. See [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

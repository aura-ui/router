# Aura UI Router

[![npm version](https://img.shields.io/npm/v/@auraui/router.svg)](https://www.npmjs.com/package/@auraui/router)
[![license](https://img.shields.io/npm/l/@auraui/router.svg)](./LICENSE)

**Declarative routing for Web Components** — declare routes in HTML, navigate without a full page reload.

> **Experimental (pre-alpha).** `@auraui/router@0.0.x` may change before `0.1.0`. Pin exact versions.

```bash
npm install @auraui/router
```

---

## 1. Install once

```ts
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

This registers `<aura-router>`, `<aura-route>`, and `<aura-outlet>`.

---

## 2. Declare routes

Put an outlet where content should appear, and list routes under `<aura-router>`:

```html
<aura-router>
  <aura-route path="/" view="html::<h1>Home</h1>"></aura-route>
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

| Piece | Role |
| --- | --- |
| `<aura-outlet>` | Where the matched view mounts |
| `<aura-route path="…">` | URL pattern |
| `view="…"` | What to render (see below) |
| `path="*"` | Catch-all 404 |

---

## 3. Add links

```html
<a href="/" data-router-link>Home</a>
<a href="/about" data-router-link>About</a>
```

Clicks on `[data-router-link]` update the URL and swap the outlet — no full reload.

Or navigate from code:

```ts
const router = document.querySelector('aura-router');
router?.navigate('/about');
router?.navigate('/about', { replace: true });
```

---

## 4. Views (slim)

Slim ships two built-in ways to put content in the outlet:

| `view` | Meaning |
| --- | --- |
| `html::<markup>` | Inline HTML in the attribute |
| `template::id` | Clone `<template id="id">` |

```html
<aura-route path="/hello" view="html::<p>Hello</p>"></aura-route>
<aura-route path="/card" view="template::card"></aura-route>
```

Put custom elements inside the template or HTML string — they work like any Web Component page.

---

## 5. Nested routes & layouts

Nest routes. A parent with `layout` is a shell; children render into its inner `<aura-outlet>`.

```html
<template id="app-shell">
  <nav>
    <a href="." data-router-link>Overview</a>
    <a href="settings" data-router-link>Settings</a>
  </nav>
  <aura-outlet></aura-outlet>
</template>

<aura-router>
  <aura-route path="/app" layout="app-shell">
    <aura-route path="." view="html::<h1>Overview</h1>"></aura-route>
    <aura-route path="settings" view="template::settings"></aura-route>
  </aura-route>
</aura-router>
```

| Pattern | Meaning |
| --- | --- |
| `layout="template-id"` | Parent shell (`<template>` must contain `<aura-outlet>`) |
| `path="."` | Index of the parent folder |
| `path="settings"` | Child segment → `/app/settings` |
| `href="settings"` / `href="."` | Path-relative links inside the layout |

Folder URLs get a trailing slash in the address bar (`/app` → `/app/`) so relative links resolve like the browser expects.

---

## Mental model

```text
click / navigate
    → match path against <aura-route> tree
    → render view / layout into <aura-outlet>
```

That’s the whole slim loop. No data layer, no prefetch, no fetch-by-URL loaders in this guide.

---

## Try the demo

```bash
git clone https://github.com/aura-ui/router.git
cd router
npm install
npm run dev
```

---

## More

> **Slim model** (this README): match URL → render a view into `<aura-outlet>`.  
> Advanced features (data `load`, prefetch, network loaders, cache, hooks) — separate docs (coming).

| | |
| --- | --- |
| Known gaps | [LIMITATIONS.md](./LIMITATIONS.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) |
| npm | [@auraui/router](https://www.npmjs.com/package/@auraui/router) |
| Site | [auraui.dev](https://auraui.dev) |

## License

MIT — see [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

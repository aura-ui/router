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
| `extract="…"` | CSS selector for a fragment from fetched (`url`) HTML |
| `path="*"` | Catch-all 404 |

---

## 3. Add links

```html
<a href="/" aura-router-link>Home</a>
<a href="/about" aura-router-link>About</a>
```

Clicks on `[aura-router-link]` update the URL and swap the outlet — no full reload.

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

## 5. Extract fragments

Use `extract` when a fetched page is full HTML and the outlet should mount only one node — a CSS selector for that root. Applies to `url` views (`view="page.html"` / `url::…`), not to inline `html::…`.

```html
<!-- default for every child route -->
<aura-router extract="#main">
  <aura-route path="/about" view="about.html"></aura-route>
  <!-- opt out: keep the full response -->
  <aura-route path="/partial" view="snippet.html" extract="none"></aura-route>
  <!-- override -->
  <aura-route path="/article" view="article.html" extract="#body"></aura-route>
</aura-router>
```

| Attr | Meaning |
| --- | --- |
| `extract="#main"` | Take `outerHTML` of the first match |
| *(no match)* | Fall back to the full HTML (`console.warn`) |
| `extract="none"` / `off` / `false` / `""` | Opt out of an inherited default |
| *(absent)* | Inherit from `<aura-router>` / parent `<aura-route>` |

Selector stays in `extract`, not inside `view`.

---

## 6. Nested routes & layouts

Nest routes. A parent with `layout` is a shell; children render into its inner `<aura-outlet>`.

```html
<template id="app-shell">
  <nav>
    <a href="." aura-router-link>Overview</a>
    <a href="settings" aura-router-link>Settings</a>
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

## 7. Cache

Control what is kept when leaving a route with the `cache` attribute on `<aura-route>` or `<aura-router>` (inherited; child overrides).

Ladder: **off → `cache` → `dom` → `all`**.

| Attr | DOM keep-alive | View payload | `load` data | Use when |
| --- | --- | --- | --- | --- |
| *(absent)* | | | | No cache |
| `cache` / `cache=""` | | ✓ | ✓ | Cache network/content; remount UI |
| `view` | | ✓ | | Only HTML / loader payload |
| `data` | | | ✓ | Only `load` hooks |
| `dom` | ✓ | ✓ | | Tabs / forms — keep live DOM (`view` is LRU fallback) |
| `all` | ✓ | ✓ | ✓ | Keep-alive + cached data |
| `off` / `none` / `false` | | | | Opt out of inherited cache |

```html
<!-- typical page: cache HTML + load, fresh DOM each visit -->
<aura-route path="/feed" view="feed.html" load="fetch-feed" cache></aura-route>

<!-- tab / editor: keep the live DOM -->
<aura-route path="/draft" view="editor.html" cache="dom"></aura-route>

<!-- sticky UI + cached load -->
<aura-route path="/inbox" view="inbox.html" load="fetch-inbox" cache="all"></aura-route>
```

Unknown values disable cache and log a `console.warn`.

---

## Mental model

```text
click / navigate
    → match path against <aura-route> tree
    → render view / layout into <aura-outlet>
```

That’s the slim loop. Data `load`, prefetch, and network loaders are optional on top of this.

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

> **Slim model** (this README): match URL → render a view into `<aura-outlet>`, plus optional [`extract`](#5-extract-fragments) and [`cache`](#7-cache).  
> Further advanced features (prefetch, network loaders, hooks) — separate docs (coming).

| | |
| --- | --- |
| Known gaps | [LIMITATIONS.md](./LIMITATIONS.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) |
| npm | [@auraui/router](https://www.npmjs.com/package/@auraui/router) |
| Site | [auraui.dev](https://auraui.dev) |

## License

MIT — see [LICENSE](./LICENSE) and [TRADEMARKS.md](./TRADEMARKS.md).

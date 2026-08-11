# Chapter 1 — Fundamentals

Install Aura Router, understand its three elements, and create the first routes.

[Guide index](../guide.md) · [Routes and navigation →](./02-routes-and-navigation.md)

---

## Installation

Pin the current `0.x` release, import the package, then install the custom elements once:

```bash
npm install --save-exact @auraui/router@0.1.0
```

```ts
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

`install()` defines `<aura-router>`, `<aura-route>`, and `<aura-outlet>`. Register global hooks and custom loaders before the router connects when its initial navigation depends on them. The package also exports the `AuraRoute` and `AuraOutlet` classes for typed DOM access.

Without a bundler:

```html
<script type="module">
  import { AuraRouter } from 'https://esm.sh/@auraui/router@0.1.0';
  AuraRouter.install();
</script>
```

Your server or static host must still serve useful HTML for every public URL. Aura Router runs only in the browser.

## Core concepts

Three elements define the routing model:

| Element         | Responsibility                                                            |
| --------------- | ------------------------------------------------------------------------- |
| `<aura-router>` | Owns navigation, history, defaults, link handling, and the route registry |
| `<aura-route>`  | Maps a path to a view, layout, redirect, hooks, and policies              |
| `<aura-outlet>` | Receives the active view; nested layouts contain another outlet           |

For a normal client navigation, think:

**match → guard → load → render or update → ready**

Leaving routes run `leave` before entering guards. Rendering can include transition hooks and `unmount`. Failures enter the `error` phase. First-paint adoption is intentionally different – it reuses server HTML and skips `guard`, `load`, and `ready`.

A minimal router:

```html
<nav>
  <a href="/" aura-router-link>Home</a>
  <a href="/about" aura-router-link>About</a>
</nav>

<aura-outlet></aura-outlet>
<aura-router>
  <aura-route path="/" view="home.html"></aura-route>
  <aura-route path="/about" view="about.html"></aura-route>
</aura-router>
```

Start with `path`, `view`, marked links, and one outlet. Add layouts, hooks, prefetch, and caching only where they solve a concrete problem.

This example loads HTML fragments. For the complete-page approach shown in the README, use [`extract`](./03-views-and-layouts.md#extract--fragment-from-full-html-pages) and follow [First paint](./05-mpa-to-spa.md#first-paint-mpa--spa).

---

[Guide index](../guide.md) · [Routes and navigation →](./02-routes-and-navigation.md)

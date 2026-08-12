# First-paint adoption reference

> **Start here:** Follow [Static site → SPA in 10 minutes](../tutorial.md) for the complete setup.
>
> **Goal:** Server HTML for the current URL is adopted on boot; later clicks are SPA.
>
> **Live:** [`playground/`](../../playground/) — hard-reload `/contacts` or `/login` (flat routes).
>
> **API:** [First paint](../guide/05-mpa-to-spa.md#first-paint-mpa--spa) · [`extract`](../guide/03-views-and-layouts.md#extract--fragment-from-full-html-pages)

Use this page as a compact reference when the initial route has already been configured. Aura does not render on the server: your host returns complete HTML, Aura adopts that HTML on startup, and later marked links use client navigation.

## Flat page

For a flat matched route, the initial document must contain an element matching the router's `extract` selector:

```html
<div class="main">
  <h1>Contacts</h1>
</div>

<aura-outlet></aura-outlet>

<aura-router extract=".main">
  <aura-route path="/contacts" view="/contacts"></aura-route>
</aura-router>

<script type="module" src="/static/main.js"></script>
```

Install the custom elements once in `main.js`:

```js
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

The selector identifies both the node adopted on first paint and the fragment extracted from complete HTML responses during later navigation. No `aura-router-ssr` marker is needed.

## Nested layout

For a nested route, return the same outlet structure that Aura would mount on the client. Mark the root layout with `aura-router-ssr`:

```html
<aura-outlet>
  <section aura-router-ssr data-aura-view-root>
    <nav>Settings</nav>
    <aura-outlet>
      <main data-aura-view-root>Profile</main>
    </aura-outlet>
  </section>
</aura-outlet>
```

Each layout must contain the outlet for the next level, and each nested view root needs `data-aura-view-root`.

> Successful adoption skips `guard`, `load`, and `ready`. The server must return authorized markup and all critical first-paint data. If a nested tree is malformed, Aura keeps the server HTML instead of remounting it immediately.

## See also

- [Recipes index](./README.md)
- [`contacts.html`](../../playground/pages/contacts.html) · [`server.js`](../../playground/server.js)
- [LIMITATIONS](../../LIMITATIONS.md) · [Auth](./auth.md) (when adopt skips `guard`)

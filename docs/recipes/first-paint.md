# Recipe: First paint (MPA → SPA)

> **Goal:** Server HTML for the current URL is adopted on boot; later clicks are SPA.  
> **Live:** [`playground/`](../../playground/) — hard-reload `/contacts` or `/login` (flat routes).  
> **API:** [First paint](../guide/05-mpa-to-spa.md#first-paint-mpa--spa) · [`extract`](../guide/03-views-and-layouts.md#extract--fragment-from-full-html-pages)

Aura does not render on the server. Your host still returns complete HTML for each URL; Aura adopts that HTML and handles later links as SPA navigation.

## Flat page

```html
<div class="main">
  <h1>Contacts</h1>
</div>

<aura-router extract=".main">
  <aura-route path="/contacts" view="contacts"></aura-route>
</aura-router>

<script src="/static/main.js" defer></script>
```

```js
import { AuraRouter } from '@auraui/router';
AuraRouter.install();
```

`extract=".main"` identifies both the fragment used for later SPA fetches and the flat view adopted on first paint.

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

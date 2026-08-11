# Recipe: First paint (MPA → SPA)

> **Goal:** Server HTML for the current URL is adopted on boot; later clicks are SPA.  
> **Live:** [`playground/`](../../playground/) — hard-reload `/contacts` or `/login` (flat routes).  
> **API:** [First paint](../guide.md#first-paint-mpa--spa) · [`extract`](../guide.md#extract--fragment-from-full-html-pages)

---

## Result

```text
First visit (flat + extract)  → adopt .main → no view fetch, no guard/load/ready
Later clicks                  → aura-router-link → fetch view (+ extract) → SPA
Nested layout shell           → marked outlet tree → adopt every level
```

Aura does not run on the server. The host still returns complete HTML for every direct URL; Aura only reuses that HTML and upgrades later in-app links.

Successful adoption skips `guard`, `load`, and `ready`. The server response must therefore already contain the correct access decision and critical first-paint data.

---

## 1. Flat page

```html
<body>
  <nav>… durable chrome outside the content root …</nav>

  <div class="main">
    <h1>Contacts</h1>
  </div>

  <aura-router extract=".main">
    <aura-route path="/contacts" view="contacts"></aura-route>
    <aura-route path="/about" view="template::about-page"></aura-route>
  </aura-router>

  <script src="/static/main.js" defer></script>
</body>
```

```js
import { AuraRouter } from '@auraui/router';
AuraRouter.install();
```

`extract=".main"` identifies both the fragment used for later SPA fetches and the flat view adopted on first paint.

Playground injects the same `<aura-router>` via `@router@` and bundles install in `/static/main.js`.

---

## 2. Nested layout

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

Each layout root must be a direct child of its parent outlet, and each layout must contain the outlet for the next level.

## 3. Choose the correct shape

| Match | Server markup | Boot |
| --- | --- | --- |
| **Flat** route (no layout parent) | Content root matches `extract` | Adopt via `extract` |
| **Nested** + outlet-shaped markup | `aura-router-ssr` on shell → `<aura-outlet>` → leaf `data-aura-view-root` | Adopt chain |
| **Nested** + malformed markup | Missing a required nested outlet or view root | Keep the server HTML; do not remount immediately |

In the playground, `/contacts` and `/login` are flat and adopt through `extract=".main"`. The `/users` and `/profile` index pages return valid marked layout trees and adopt every level.

The `/users/:id` and `/profile/settings` pages intentionally omit part of the required nested outlet structure. Aura preserves that server HTML on boot instead of replacing it immediately. In production, return the complete hierarchy rather than relying on this mismatch behaviour.

---

## Try it

Complete the [one-time playground setup](./README.md#one-time-playground-setup) first.

```bash
cd playground
npm run dev
```

1. Hard-reload `/contacts` — response already has `.main`; client should not refetch `contacts` for adopt.
2. Click **About** — SPA (`template::`, no full reload).
3. Click **Contacts** — SPA fetch + `extract=".main"`. `cache="off"` disables durable caching, although the short handoff buffer may still reuse recent work.
4. Hard-reload `/users` — the marked layout, nested outlet, and list view are adopted together.
5. Hard-reload `/users/1` — the incomplete nested server tree stays visible without an immediate client remount.

---

## See also

- [Recipes index](./README.md)
- [`contacts.html`](../../playground/pages/contacts.html) · [`server.js`](../../playground/server.js)
- [LIMITATIONS](../../LIMITATIONS.md) · [Auth](./auth.md) (when adopt skips `guard`)

# Recipe: First paint (MPA → SPA)

> **Goal:** Server HTML for the current URL is adopted on boot; later clicks are SPA.  
> **Live:** [`playground/`](../../playground/) — hard-reload `/contacts` or `/login` (flat routes).  
> **API:** [First paint](../guide.md#first-paint-mpa--spa) · [`extract`](../guide.md#extract--fragment-from-full-html-pages)

---

## What you get

```text
First visit (adopt OK)  → aura-router-ssr → no view fetch, no guard/load/ready
Later clicks            → aura-router-link → fetch view (+ extract) → SPA
```

Aura does not run on the server. The host keeps serving HTML pages.

---

## Page

```html
<body>
  <nav>… durable chrome outside the marked node …</nav>

  <div class="main" aura-router-ssr>
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

| Piece | Role |
| --- | --- |
| `aura-router-ssr` | Mark the node that already is the current view |
| `extract=".main"` | Fragment selector for **later** SPA `url` fetches |

Playground injects the same `<aura-router>` via `@router@` and bundles install in `/static/main.js`.

---

## Flat vs nested

| Match | Server markup | Boot |
| --- | --- | --- |
| **Flat** route (no layout parent) | Marker on the content root | Adopt |
| **Nested** + outlet-shaped markup | layout → `<aura-outlet>` → leaf `data-aura-view-root` | Adopt |
| **Nested** + flat blob | e.g. only `.main`, no outlets | Normal first navigation (fetch `view`) |

Playground: `/contacts` and `/login` are flat → good adopt demos. `/users` and `/profile` are nested with flat markup → hard reload does **not** adopt; the client fetches like a cold SPA entry. Nested adopt shape: [guide](../guide.md#first-paint-mpa--spa).

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Hard-reload `/contacts` — response already has the HTML; client should not refetch `contacts` for adopt.
2. Click **About** — SPA (`template::`, no full reload).
3. Click **Contacts** — SPA fetch + `extract=".main"`; `cache="off"` → ~1s every time.
4. Hard-reload `/users` — nested fallback (fetch), unlike step 1.

---

## See also

- [`contacts.html`](../../playground/pages/contacts.html) · [`server.js`](../../playground/server.js)
- [LIMITATIONS](../../LIMITATIONS.md) · [Auth](./auth.md) (when adopt skips `guard`)

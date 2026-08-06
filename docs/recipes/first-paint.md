# Recipe: First paint (MPA → SPA)

> **Goal:** Server HTML for the current URL is adopted on boot; later clicks are SPA.  
> **Live:** [`playground/`](../../playground/) — hard-reload `/contacts` or `/login` (flat routes).  
> **API:** [First paint](../guide.md#first-paint-mpa--spa) · [`extract`](../guide.md#extract--fragment-from-full-html-pages)

---

## What you get

```text
First visit (flat + extract)  → adopt #main / .main → no view fetch, no guard/load/ready
Later clicks                  → aura-router-link → fetch view (+ extract) → SPA
Nested layout shell           → aura-router-ssr on shell (when shell ≠ extract)
```

Aura does not run on the server. The host keeps serving HTML pages.

---

## Page (flat)

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

| Piece | Role |
| --- | --- |
| `extract=".main"` | Fragment for SPA fetches **and** flat first-paint adopt |
| `aura-router-ssr` | Only when a nested **layout shell** differs from the extract node |

Playground injects the same `<aura-router>` via `@router@` and bundles install in `/static/main.js`.

---

## Flat vs nested

| Match | Server markup | Boot |
| --- | --- | --- |
| **Flat** route (no layout parent) | Content root matches `extract` | Adopt via `extract` |
| **Nested** + outlet-shaped markup | `aura-router-ssr` on shell → `<aura-outlet>` → leaf `data-aura-view-root` | Adopt chain |
| **Nested** + flat blob | e.g. only `.main`, no shell marker / outlets | structure-error / cold entry |

Playground: `/contacts` and `/login` are flat → adopt via `extract=".main"`. `/users` and `/profile` are nested — hard reload does **not** fully adopt a flat leaf blob; use the nested outlet shape + `aura-router-ssr` on the shell when you need adopt. Details: [guide](../guide.md#first-paint-mpa--spa).

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Hard-reload `/contacts` — response already has `.main`; client should not refetch `contacts` for adopt.
2. Click **About** — SPA (`template::`, no full reload).
3. Click **Contacts** — SPA fetch + `extract=".main"`; `cache="off"` → ~1s every time.
4. Hard-reload `/users` — nested mismatch / cold path, unlike step 1.

---

## See also

- [`contacts.html`](../../playground/pages/contacts.html) · [`server.js`](../../playground/server.js)
- [LIMITATIONS](../../LIMITATIONS.md) · [Auth](./auth.md) (when adopt skips `guard`)

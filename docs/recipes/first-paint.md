# Recipe: First paint (MPA → SPA)

> **Goal:** Server sends ready HTML for the current URL; Aura adopts it on boot without refetching, then handles later navigations as SPA.  
> **Live:** [`playground/`](../../playground/) — hard-reload a **flat** page such as `/contacts` or `/login`.  
> **API:** [First paint (MPA → SPA)](../guide.md#first-paint-mpa--spa) · [`extract`](../guide.md#extract--fragment-from-full-html-pages)

---

## What you get

```text
First visit  → full HTML from server + aura-router-ssr → adopt (no fetch, no guard/load/ready)
Next clicks  → aura-router-link → fetch view (url + extract) → SPA swap
```

Aura does **not** run on the server. The host (Express, nginx, CMS) keeps serving pages; the client upgrades in-app links.

---

## 1. Server page

```html
<body>
  <nav>… durable chrome (outside the marked node) …</nav>

  <div class="main" aura-router-ssr>
    <h1>Contacts</h1>
    <p>Rendered by the server for this URL.</p>
  </div>

  <!-- same router declaration on every page -->
  <aura-router extract=".main" prefetch="true">
    <aura-route path="/contacts" view="contacts" extract=".main"></aura-route>
    <aura-route path="/about" view="template::about-page"></aura-route>
  </aura-router>

  <script type="module" src="/static/main.js"></script>
</body>
```

| Piece | Role |
| --- | --- |
| `aura-router-ssr` | Mark the content root already painted for this URL |
| `extract=".main"` | Later SPA navigations take the same fragment from fetched HTML |
| `<aura-router>` in the page | Client route table (playground injects it via `@router@`) |

On successful adopt, first-paint lifecycle (`guard` / `load` / `ready`) is **skipped** — put critical content (and auth, if needed) in the server HTML.

---

## 2. Client install

```js
import { AuraRouter } from '@auraui/router';

AuraRouter.install();
```

No extra adopt API — install + a connected `<aura-router>` + matching URL is enough.

---

## 3. Flat vs nested

| Match | Server markup | Boot behavior |
| --- | --- | --- |
| **Flat** route (no layout parent) | Marker on the content root | Adopt; skip fetch + lifecycle |
| **Nested** (layout + leaf) | Must mirror outlets: layout → `<aura-outlet>` → leaf `data-aura-view-root` | Adopt only if the tree matches |
| Nested match + flat blob | e.g. only `.main` without outlets | **Falls back** to a normal first navigation (refetch) |

Playground `/contacts` and `/login` are flat — good adopt demos. `/users` and `/profile` are nested; their pages are mostly flat blobs, so hard reload often refetches instead of adopting. Full nested shape: [guide](../guide.md#first-paint-mpa--spa).

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Hard-reload `/contacts` — HTML is in the response; the client should **not** refetch `contacts` for adopt.
2. Click **About** — SPA navigation (`template::`, no full reload).
3. Click **Contacts** again — SPA fetch + `extract=".main"` (and `cache="off"` → ~1s delay every time).
4. Hard-reload `/login` — another flat adopt. Compare with hard-reload `/users` (nested) — likely a normal first fetch, not adopt.

---

## See also

- Playground layout inject: [`server.js`](../../playground/server.js) (`@nav@` / `@router@`)
- Example page: [`contacts.html`](../../playground/pages/contacts.html)
- Guide: [First paint](../guide.md#first-paint-mpa--spa) · [LIMITATIONS](../../LIMITATIONS.md)
- [Prefetch & cache](./prefetch-cache.md) — later navigations
- [Auth](./auth.md) — why hard reload can skip `guard`

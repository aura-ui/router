# What Aura is not

Boundaries for [`@auraui/router`](https://www.npmjs.com/package/@auraui/router) — what it does, what it refuses, and how that differs from Turbo, Unpoly, swup, and htmx.

[Guide](./guide.md) · [Tutorial](./tutorial.md) · [Limitations](../LIMITATIONS.md)

---

## Aura is

HTML-first **client navigation** on pages your host already serves: opt-in link upgrades (default `data-aura-link`), `extract` / first-paint adopt, nested layouts, route lifecycle. Plain HTML, Web Components, or Lit — no framework adapter, no Aura server.

Complete documents per URL are the main path; fragment / template / component views are also supported.

---

## Aura is not

| Not | Meaning |
| --- | ------- |
| React / Vue / TanStack-style SPA router | HTML + URL stay the substrate, not a virtual app tree |
| Turbo / htmx replacement | Upgrades **link navigation**, not a hypermedia app runtime |
| Form / mutation layer | No `<form>` intercept; mutations stay in the app, then `navigate()` / `invalidate()` |
| Data framework | Has `load` / cache; not a query library. Nav-time SWR not shipped ([Limitations](../LIMITATIONS.md)) |
| Incremental DOM / React-lite | Outlet replace/adopt — no DOM diffing |

---

## vs Turbo / Unpoly / swup / htmx

| | **Aura** | **Turbo** | **Unpoly** | **swup** | **htmx** |
| -- | -------- | --------- | ---------- | -------- | -------- |
| **Idea** | Opt-in SPA nav on real HTML | Drive + Frames / Streams | PE via HTML attrs | Page transitions + cache | Hypermedia attrs + swaps |
| **Links** | Marker (default `data-aura-link`) | Intercept by default | Attribute-driven | Enhanced nav | `hx-*` |
| **Forms** | No — app + `navigate()` | Yes | Yes | No by default | Yes |
| **Nested UI** | Routes / layouts / `<aura-outlet>` | Frames | Layers / fragments | Page-oriented | Swap targets |
| **Pick when** | Keep pages; add nested SPA nav + lifecycle | Want Drive/Frames + form PE | Want rich HTML PE / layers | Want transition-focused MPA | Want hypermedia as the model |

---

## Forms

Router owns **GET navigation**. The app owns submit / upload / validation.

1. Handle the form in a component or plain JS.  
2. `fetch` (or your handler) to the API / endpoint.  
3. On success: `router.navigate(...)` / `invalidate()`.

No-JS form submit = full page load. That is expected, not a gap.

# Chapter 5 — First paint: MPA → SPA

Adopt server-rendered HTML on startup without refetching the current route.

[← Lifecycle and route data](./04-lifecycle-and-data.md) · [Guide index](../guide.md) · [Navigation experience →](./06-navigation-ux.md)

---

## First paint (MPA → SPA)

On the first page load, the document may already contain HTML for the current URL. Aura can adopt this markup as the active route instead of fetching and mounting the same view again.

Aura does not render HTML on the server. Your server or static host remains responsible for returning the page. Successful adoption skips `guard`, `load`, and `ready`, so the response must already contain the correct access decision and any critical first-paint data.

### Flat pages

For a flat route, render an element that matches the router's `extract` selector. Aura adopts that element as the route view:

```html
<main id="content"><h1>About</h1></main>

<aura-router extract="#content">
  <aura-route path="/about" view="/about"></aura-route>
</aura-router>
```

No `aura-router-ssr` marker is needed for this flat case.

### Nested layouts

For a nested route, the server HTML must match the outlet structure that Aura would mount. Mark the root layout with `aura-router-ssr`:

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

For Aura to adopt every level:

- each layout root is a direct child of its parent `<aura-outlet>`;
- each layout has a direct-child `<aura-outlet>` for the next level;
- nested view roots have `data-aura-view-root`;
- the marked root may omit `data-aura-view-root` because Aura adds it.

`aura-router-ssr` is only a DOM marker, not a server runtime. Its exported constant is `AURA_ROUTER_SSR_ATTR`.

### Adoption outcomes

| Initial state                                          | Result                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Flat match with an `extract` node                      | Adopt it and sync active links                                          |
| Valid marked nested outlet tree                        | Adopt every level                                                       |
| Marker on a flat match                                 | Marker wins over `extract`                                              |
| No usable node, no match, or redirect                  | Run normal initial navigation                                           |
| Nested match with a leaf blob or malformed outlet tree | `structure-error` – preserve server HTML and do not immediately remount |

On `structure-error`, fix the returned outlet hierarchy rather than forcing a client remount. Keep durable site chrome outside the adopted node if later SPA navigation should not replace it.

### After first paint

Adoption is a bootstrap-only shortcut. Returning to an adopted URL later uses the normal route view loader; for a `url` view, Aura fetches the page and applies the same `extract` selector.

---

[← Lifecycle and route data](./04-lifecycle-and-data.md) · [Guide index](../guide.md) · [Navigation experience →](./06-navigation-ux.md)

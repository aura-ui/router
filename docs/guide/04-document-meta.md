# Chapter 4 — Document meta

Each in-app navigation can update the tab title, `<html lang>` / `<html dir>`, and selected tags in `<head>` — description, canonical, Open Graph, Twitter, and any slots you register. Aura applies these changes automatically after a successful commit. No hooks are required.

**Per-page meta lives in the HTML page.** Put the complete `<title>` (including any site suffix), description, canonical, and social tags in the document you already serve. Hard reload, no-JS, and the committed client navigation then show the same title. Route attributes overlay when HTML cannot cover the case — non-url views, same-route param updates — and when you want the **tab title to change on click**, before the page has loaded.

[← Views and layouts](./03-views-and-layouts.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./05-lifecycle-and-data.md)

---

## HTML is the source of truth

On a `url` view (`view="about.html"`, `view="/about/"`, and other url loaders), Aura reads meta from the **full HTML response** of the **leaf** route — even when [`extract`](./03-views-and-layouts.md#extract--fragment-from-full-html-pages) mounts only part of the page.

```html
<!-- about.html -->
<!doctype html>
<html lang="en">
  <head>
    <title>About | My App</title>
    <meta name="description" content="Who we are" />
    <link rel="canonical" href="https://example.com/about" />
  </head>
  <body>
    <main id="content">…</main>
  </body>
</html>
```

```html
<aura-router extract="#content">
  <aura-route path="/about" view="about.html"></aura-route>
</aura-router>
```

The route does **not** repeat the page title. Unset overlay attrs leave the fetched `<title>` unchanged.

```text
Leaf page HTML  ──►  title, lang, dir, <head> tags   (at commit)
        +
Route attrs     ──►  overlay; title may preview as soon as the URL aligns
        │
        ▼
Live document
```

Inline loaders (`html::`, `template::`, `component::`, `import::`, and custom loaders) do not carry HTML meta. On those routes, use route attrs (or accept boot defaults).

## Fields from fetched HTML

When a route loads a complete HTML file, Aura reads:

| In the response | Applied to |
| --------------- | ---------- |
| `<title>` | `document.title` |
| `<html lang="…">` | `lang` on `<html>` |
| `<html dir="…">` | `dir` on `<html>` |
| `<meta name="description">` | description |
| `<link rel="canonical">` | canonical URL |
| `og:title`, `og:description`, `og:image`, `og:url` | matching `<meta property="…">` |
| `twitter:card`, `twitter:title`, `twitter:image` | matching `<meta name="…">` |

If the leaf page omits a field and no route attr supplies it, Aura clears the **managed** copy of that slot on the next navigation (see [Boot shell and revert](#boot-shell-and-revert)).

## Boot shell and revert

On the first apply, Aura snapshots the boot values of `document.title`, `<html lang>`, and `<html dir>`. When a later route omits one of those fields, Aura restores the boot value.

For `<head>` tags, Aura only **removes tags it wrote itself** (marked internally). Tags from your initial HTML shell stay in the document.

When a managed slot matches an existing shell tag, Aura may **reuse and update** that element — for example, replacing a default description with a page-specific one. If the next route omits that slot, Aura removes only its owned copy; an unmarked shell tag that was never taken over remains unchanged.

Put site-wide defaults in the boot `<head>`. Put per-page values in each fetched HTML file.

## Overlay attrs

Without route title attrs, the tab keeps the previous title until the view is fetched and committed. Active links already reflect the new URL, so the tab can look late. Set `meta-title` (and optionally `meta-title-template`) when you want the tab to update **immediately** on navigation — Aura previews `document.title` as soon as the URL aligns, then confirms it at commit or rolls it back on cancel.

That is the main reason to put `meta-title` on a url route that already has `<title>` in HTML: the HTML stays the source for hard reload and SEO; the attr is the instant client preview. Keep the two in sync, or the tab will flash one title and settle on another.

Attrs also cover cases HTML cannot supply at all:

| When | What to set |
| ---- | ----------- |
| Instant tab title (url or not) | `meta-title` on the route — preview at URL align, before fetch |
| `template::` / `html::` / other non-url views | `meta-title` (and description/canonical if needed) |
| Same-route param/query update (view reused, only data reloads) | `meta-title="User :id"` and other token attrs |
| Rare override of a fetched page | the matching attr on that route |

| HTML attribute | Effect |
| -------------- | ------ |
| `meta-title` | Overlay for the page title; supports `:param` tokens |
| `meta-title-template` | Opt-in wrap of the page title (`%s`); see [Title template](#title-template-opt-in) |
| `meta-description` | Overlay for `<meta name="description">` |
| `meta-canonical` | Overlay for `<link rel="canonical">` |

Attrs inherit from `<aura-router>` and from **parent routes**, the same way as `scroll` and `extract`. A child overrides an inherited value. Opt out with `none`, `off`, `false`, or an empty value.

### Instant tab title

```html
<aura-route path="/about" view="about.html" meta-title="About | My App"></aura-route>
```

The click updates the tab at once. After fetch, Aura applies meta from the HTML (and any attrs). Description, canonical, and social tags still wait for the page — only title can preview.

Without `meta-title`, `/about` keeps the previous tab title until `about.html` has loaded.

### Non-url views

```html
<aura-route path="/about" view="template::about-page" meta-title="About"></aura-route>
```

There is no fetched `<title>`, so the route attr is the page title.

### Same-route param updates

When `/users/1` → `/users/2` **reuses** the mounted view ([same-route updates](./03-views-and-layouts.md#same-route-updates)), Aura does not fetch HTML again. `htmlMeta` stays whatever the first page had — so a `<title>` in `users/shell.html` will not become “User 2”.

Token attrs on the route fill that gap. They resolve from the **new** params as soon as the URL aligns (preview) and again at commit:

```html
<aura-route
  path="/users/:id"
  view="users/shell.html"
  load="fetch-user"
  update="apply-user"
  meta-title="User :id"
  meta-description="Profile :id"
  meta-canonical="https://example.com/users/:id"
></aura-route>
```

That is **not** the same as `view="users/:id.html"`. There the resolved file changes (`users/1.html` → `users/2.html`), Aura remounts, and each page can carry its own `<title>`. Prefer HTML meta in that html-first case; use token attrs when the shell is reused and only data reloads.

### Rare override

When both HTML and a route attr provide a value, **the attr wins** for title, description, and canonical. Other fields from the fetched page are kept.

```html
<aura-route path="/preview" view="preview.html" meta-title="Preview"></aura-route>
```

### Tokens

`:name` tokens resolve from path params and query — the same rules as in `view`. Path params win when the same name appears in both. A `?` in a title string is literal. Meta attrs do not use the search syntax from [`view`](./03-views-and-layouts.md#search-on-view-not-on-path).

## Title template (opt-in)

`meta-title-template` wraps the resolved page title. **Unset is the html-first default:** Aura copies the HTML `<title>` (or `meta-title`) as-is.

Use it when titles come from **route attrs** — template views, param-update shells — and you want one suffix on the router instead of repeating it on every `meta-title`:

```html
<aura-router meta-title-template="%s | My App">
  <aura-route path="/about" view="template::about-page" meta-title="About"></aura-route>
  <aura-route path="/users/:id" view="users/shell.html" meta-title="User :id"></aura-route>
</aura-router>
```

Do **not** use it to brand fetched HTML pages. A server `<title>About</title>` plus `%s | My App` means a direct visit shows `About` and a client navigation shows `About | My App`. If the HTML already includes the suffix, the client doubles it. Put the full title in each HTML file instead.

Rules:

- `%s` is replaced with the **page title**.
- The page title is a **local** `meta-title` on the route element when present; otherwise the HTML `<title>`.
- An inherited `meta-title` from `<aura-router>` is a fallback when there is nothing to wrap — it is **not** the `%s` source.
- If the template contains no `%s`, Aura uses the page title as-is — the template text is not prepended.

Set `meta-title-template="none"` on a route to opt out of an inherited wrap.

## Extra head tags

Register additional managed slots before the first fetch:

```ts
AuraRouter.configure({
  documentMeta: {
    tags: [
      { tag: 'meta', attrs: { name: 'theme-color' } },
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'en' } },
    ],
  },
});
```

Aura then reads and writes those tags the same way as the built-in SEO / Open Graph set. Pass `tags: []` to clear configured slots.

Call `configure()` before navigation starts. Views cached before registration may not include the new slots.

## Nested layouts

Two rules apply in a layout + child setup:

| What | Behaviour |
| ---- | --------- |
| **HTML meta** | Only the **leaf page's** fetched HTML is used — not HTML from the layout template or a parent route's `view`. |
| **Route attrs** | Inherited from `<aura-router>` and **parent routes**, including the layout route. |

HTML meta from a layout route's own `view` does **not** merge into the child. Put the complete title on each leaf HTML page (or in overlay attrs when there is no page). A client-only wrap will not match a direct visit to that URL.

## Limitations (0.x)

- **`lang` / `dir` from HTML only** — no route attrs yet; set them in fetched pages or manage them manually.
- **Non-url loaders** — rely on overlay attrs; without attrs, title / lang / dir revert to boot and managed tags are cleared.
- **Scripts and styles** — Aura does not reconcile `<script>`, `<link rel="stylesheet">`, or other head assets on navigation.
- **No HTML meta merge** — parent and child HTML meta are not combined.

## Quick reference

```html
<aura-router>
  <aura-route path="/about" view="about.html" meta-title="About | My App"></aura-route>
  <aura-route path="/info" view="template::info" meta-title="Info"></aura-route>
</aura-router>
```

| Goal | How |
| ---- | --- |
| Title, description, canonical | Tags in the fetched HTML page (full `<title>`, including any suffix) |
| Instant tab title while the page loads | `meta-title` on the route (preview at URL align) |
| Non-url view title | `meta-title` on that route |
| Param update, same shell | `meta-title="User :id"` (HTML is not refetched) |
| Shared suffix for attr titles | `meta-title-template="%s \| App"` — opt-in; diverges from server HTML if you also wrap fetched pages |
| Override a fetched field | matching `meta-*` attr on that route (rare) |
| Opt out of inherit | `meta-*="none"` on the route |
| Custom meta name | `AuraRouter.configure({ documentMeta: { tags: […] } })` |
| Site-wide shell tags | Boot HTML `<head>` |

---

[← Views and layouts](./03-views-and-layouts.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./05-lifecycle-and-data.md)

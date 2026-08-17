# Chapter 4 — Document meta

Each in-app navigation can update the tab title, `<html lang>` / `<html dir>`, and selected tags in `<head>` — description, canonical, Open Graph, Twitter, and any slots you register. Aura applies these changes automatically after a successful commit. No hooks are required.

[← Views and layouts](./03-views-and-layouts.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./05-lifecycle-and-data.md)

---

## Two sources of meta

Aura combines two inputs on every navigation:

1. **HTML meta** — read from the **leaf** route's fetched page (`view="page.html"` and other `url` loaders).
2. **Route attrs** — `meta-title`, `meta-title-template`, `meta-description`, and `meta-canonical` on the matched route, including values inherited from `<aura-router>` and parent routes.

Inline loaders (`html::`, `template::`, `component::`, `import::`, and custom loaders) do not carry HTML meta. On those routes, only route attrs (and boot defaults) apply.

```text
Leaf page HTML  ──►  title, lang, dir, <head> tags
        +
Route attrs     ──►  overlay / override
        │
        ▼
Live document   ──►  after navigation:commit
```

Meta is always parsed from the **full HTML response**, even when [`extract`](./03-views-and-layouts.md#extract--fragment-from-full-html-pages) mounts only part of the page into the outlet.

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

Put site-wide defaults in the boot `<head>`. Put per-page values in fetched HTML or route attrs.

## Route attributes

| HTML attribute | Effect |
| -------------- | ------ |
| `meta-title` | Sets the page title; supports `:param` tokens |
| `meta-title-template` | Wraps the page title; `%s` is the placeholder |
| `meta-description` | Sets `<meta name="description" content="…">` |
| `meta-canonical` | Sets `<link rel="canonical" href="…">` |

Attrs inherit from `<aura-router>` and from **parent routes**, the same way as `scroll` and `extract`. A child overrides an inherited value.

Opt out with `none`, `off`, `false`, or an empty value:

```html
<aura-route path="/raw" view="raw.html" meta-description="none"></aura-route>
```

### Tokens

`:name` tokens resolve from path params and query — the same rules as in `view`. Path params win when the same name appears in both:

```html
<aura-route
  path="/users/:id"
  view="users/:id.html"
  meta-title="User :id"
  meta-description="Profile of user :id"
  meta-canonical="https://example.com/users/:id"
></aura-route>
```

For `/users/42`, the tab title becomes `User 42`.

A `?` in a title string is literal. Meta attrs do not use the search syntax from [`view`](./03-views-and-layouts.md#search-on-view-not-on-path).

### Title templates

Use `meta-title-template` on `<aura-router>` or a parent route to suffix or wrap page titles:

```html
<aura-router meta-title-template="%s | My App">
  <aura-route path="/about" view="about.html"></aura-route>
</aura-router>
```

If `about.html` contains `<title>About</title>`, the tab title becomes `About | My App`.

Rules:

- `%s` is replaced with the **page title**.
- The page title is a **local** `meta-title` on the route element when present; otherwise the HTML `<title>`.
- An inherited `meta-title` sets the default title but is **not** used as the `%s` source unless the leaf route also declares `meta-title`.
- If the template contains no `%s`, Aura uses the page title as-is — the template text is not prepended.

Examples:

```html
<!-- Local title + inherited wrap → User 42 | My App -->
<aura-router meta-title-template="%s | My App">
  <aura-route path="/users/:id" meta-title="User :id" view="users/:id.html"></aura-route>
</aura-router>

<!-- HTML title + wrap → About | My App -->
<aura-router meta-title-template="%s | My App">
  <aura-route path="/about" view="about.html"></aura-route>
</aura-router>

<!-- Inherited site title only → My App (no local title, no HTML title to wrap) -->
<aura-router meta-title="My App" meta-title-template="%s | My App">
  <aura-route path="/" view="home.html"></aura-route>
</aura-router>
```

Set `meta-title-template="none"` on a route to opt out of an inherited wrap.

### Route attrs vs HTML

When both HTML and route attrs provide a value, **route attrs win** for title, description, and canonical.

When a route sets only some attrs, values from the fetched HTML are kept for the rest. For example, `meta-title` replaces the HTML `<title>` but leaves an extracted canonical link unchanged.

## Site-wide defaults

Three patterns cover most applications:

**1. Boot shell `<head>`**

Favicon, analytics, and other static tags in your initial HTML. Aura does not remove unmarked shell tags.

**2. Inherited route attrs**

Shared suffix, default description, or canonical pattern on `<aura-router>` or a layout parent:

```html
<aura-router meta-title-template="%s | My App" meta-description="Product docs">
  <aura-route path="/docs" view="docs.html"></aura-route>
  <aura-route path="/pricing" view="pricing.html" meta-description="Plans and pricing"></aura-route>
</aura-router>
```

The `/docs` route inherits both attrs. `/pricing` overrides the description.

**3. Per-page HTML**

Each fetched page carries its own `<title>` and `<meta>` tags. Add route attrs only where HTML is generic or shared.

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

```html
<aura-route path="/app" layout="app-shell" meta-description="My App">
  <aura-route path="settings" view="app/settings.html"></aura-route>
</aura-route>
```

For `/app/settings`, description comes from inherited `meta-description="My App"` unless `settings.html` or a attrs on the child route override it.

HTML meta from a layout route's own `view` does **not** merge into the child. To share a description across nested pages, use inherited attrs on the layout or router, or tags in the boot shell — not HTML meta from the layout's fetched page alone.

## Limitations (0.x)

- **`lang` / `dir` from HTML only** — no route attrs yet; set them in fetched pages or manage them manually.
- **Non-url loaders** — rely on route attrs; without attrs, title / lang / dir revert to boot and managed tags are cleared.
- **Scripts and styles** — Aura does not reconcile `<script>`, `<link rel="stylesheet">`, or other head assets on navigation.
- **No HTML meta merge** — parent and child HTML meta are not combined; use inherited attrs or boot defaults for shared values.

## Quick reference

```html
<aura-router meta-title-template="%s | My App">
  <aura-route
    path="/users/:id"
    view="users/:id.html"
    meta-title="User :id"
    meta-description="Profile :id"
    meta-canonical="https://example.com/users/:id"
  ></aura-route>
</aura-router>
```

| Goal | How |
| ---- | --- |
| Title from HTML | Fetch a page with `<title>` |
| Title suffix | `meta-title-template="%s \| App"` on `<aura-router>` or a parent |
| Fixed title | `meta-title="…"` on a route or router |
| Description / canonical | Tags in fetched HTML, or `meta-description` / `meta-canonical` attrs |
| Opt out of inherit | `meta-*="none"` on the route |
| Custom meta name | `AuraRouter.configure({ documentMeta: { tags: […] } })` |
| Site-wide shell tags | Boot HTML `<head>` |
| Shared meta in nested apps | Inherit attrs on layout or router — not HTML from the layout page |

---

[← Views and layouts](./03-views-and-layouts.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./05-lifecycle-and-data.md)

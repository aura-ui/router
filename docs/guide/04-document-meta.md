# Chapter 4 — Document meta

On each in-app navigation Aura updates the tab title, `<html lang>` / `<html dir>`, and selected `<head>` tags. Put per-page values in the HTML you already serve. Use route attributes only when that HTML cannot, or when the tab title should change before the page has loaded. No hooks are required.

[← Views and layouts](./03-views-and-layouts.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./05-lifecycle-and-data.md)

---

## HTML is the source of truth

Put the complete `<title>` (including any site suffix), description, canonical, and social tags in the page you already serve. Then a hard reload, no-JS visit, and client navigation all show the same title.

On a `url` view (`view="about.html"`), Aura reads meta from the **full HTML response** of the **leaf** route – even when [`extract`](./03-views-and-layouts.md#extract--fragment-from-full-html-pages) mounts only part of the page.

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

Leave `meta-title` unset. Aura copies the fetched `<title>` after the page loads.

`html::`, `template::`, `component::`, `import::`, `iframe::`, and custom loaders have no HTML document to read. Set route attributes on those routes – see [Route attributes](#route-attributes).

## What Aura copies

When a route loads a complete HTML file, Aura reads:

| In the response | Applied to |
| --------------- | ---------- |
| `<title>` | `document.title` |
| `<html lang="…">` | `lang` on `<html>` |
| `<html dir="…">` | `dir` on `<html>` |
| `<meta name="description">` | `<meta name="description">` |
| `<link rel="canonical">` | `<link rel="canonical">` |
| `og:title`, `og:description`, `og:image`, `og:url` | matching `<meta property="…">` |
| `twitter:card`, `twitter:title`, `twitter:image` | matching `<meta name="…">` |

If a later page omits a field, Aura reverts it. See [Boot shell and revert](#boot-shell-and-revert).

## Route attributes

Use a route attribute when the tab should update before fetch, when there is no HTML page, or when a reused shell cannot change its `<title>`.

| Attribute | Sets |
| --------- | ---- |
| `meta-title` | Tab title (`:param` tokens allowed) |
| `meta-title-template` | Optional wrap around the page title (`%s`); see [Title template](#title-template-opt-in) |
| `meta-description` | `<meta name="description">` |
| `meta-canonical` | `<link rel="canonical">` |

**Priority.** If the attribute is set, Aura uses it and ignores the matching field in HTML. If the attribute is unset, Aura uses the HTML. There are no route attributes for `lang`, `dir`, Open Graph, or Twitter; those always come from the fetched page.

Keep `meta-title` and the HTML `<title>` **equal** when you set both. A client navigation shows the attribute; a direct visit shows the HTML. Aura will not switch from one to the other in the same navigation.

`meta-title`, `meta-description`, and `meta-canonical` inherit from **parent routes**, not from `<aura-router>`. `meta-title-template` inherits from both. A child overrides an inherited value. Opt out with `none`, `off`, `false`, or an empty value.

### Instant tab title

Without `meta-title`, the tab keeps the previous title until the HTML has loaded. The URL and active links already show the new page, so the tab can look late.

Copy the HTML `<title>` onto the route when you want the tab to update as soon as the URL changes:

```html
<aura-route path="/about" view="about.html" meta-title="About | My App"></aura-route>
```

The attribute writes the tab immediately and stays after fetch. Description, canonical, and social tags then come from the HTML. If navigation is cancelled, the previous title comes back.

### Non-url views

There is no fetched `<title>`, so the route attribute is the page title:

```html
<aura-route path="/about" view="template::about-page" meta-title="About"></aura-route>
```

### Same-route param updates

When `/users/1` → `/users/2` **reuses** the mounted view ([same-route updates](./03-views-and-layouts.md#same-route-updates)), Aura does not fetch HTML again. Meta from the first page stays, so a `<title>` in `users/shell.html` will not become "User 2".

Token attrs resolve from the **new** params as soon as the URL changes, and again when navigation finishes:

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

That is **not** the same as `view="users/:id.html"`. There the file itself changes (`users/1.html` → `users/2.html`), Aura remounts, and each page can carry its own `<title>`. Prefer HTML meta in that case. Use token attrs when the shell is reused and only data reloads.

### Tokens

`:name` tokens resolve from path params and query – the same rules as in `view`. Path params win when the same name appears in both. A `?` in a title string is literal. Meta attrs do not use the search syntax from [`view`](./03-views-and-layouts.md#search-on-view-not-on-path).

## Title template (opt-in)

`meta-title-template` adds a suffix (or other wrap) to the page title. When it is unset, Aura copies `meta-title` or the HTML `<title>` as-is.

Use it when titles come from **route attributes** – template views, param-update shells – so you do not repeat the suffix on every `meta-title`:

```html
<aura-router meta-title-template="%s | My App">
  <aura-route path="/about" view="template::about-page" meta-title="About"></aura-route>
  <aura-route path="/users/:id" view="users/shell.html" meta-title="User :id"></aura-route>
</aura-router>
```

Do **not** wrap fetched HTML pages. A server `<title>About</title>` plus `%s | My App` means a direct visit shows `About` and a client navigation shows `About | My App`. If the HTML already includes the suffix, the client doubles it. Put the full title in each HTML file instead.

`%s` is replaced with the page title, which is:

1. `meta-title` on **that** `<aura-route>` element, if the attribute is present;
2. otherwise the HTML `<title>`.

An inherited `meta-title` from a parent route is not wrapped. It is only used when there is nothing else to show. If the template contains no `%s`, Aura uses the page title as-is.

Set `meta-title-template="none"` on a route to opt out of an inherited wrap.

## Nested layouts

| What | Behaviour |
| ---- | --------- |
| **HTML meta** | Only the **leaf page's** fetched HTML – not the layout template, and not a parent route's `view`. |
| **Route attrs** | `meta-title` / description / canonical from **parent routes** (including the layout route); `meta-title-template` also from `<aura-router>`. |

Put the complete title on each leaf HTML page (or in route attrs when there is no page). Parent and child HTML meta are not merged.

## Boot shell and revert

The first time Aura writes the title, it remembers the current `document.title`, `<html lang>`, and `<html dir>` as **boot** values. A later route that omits one of those fields gets the boot value back.

`<head>` tags (description, canonical, Open Graph, Twitter, and any slots you register) follow a stricter rule:

- A tag Aura never touched stays as it was in the boot HTML.
- If a page supplies that slot, Aura updates the existing element and then owns it. The next page that **omits** the slot removes the tag. The boot default does not return.

Put every per-page SEO field in each fetched HTML file. Leave in the boot `<head>` only tags that no page sets.

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

Aura then reads and writes those tags the same way as the built-in SEO / Open Graph set. Pass `tags: []` to drop extra slots you added earlier; the built-in set stays.

Call `configure()` before navigation starts. Views cached before registration may not include the new slots.

## Limitations (0.x)

- **`lang` / `dir` from HTML only** – no route attrs yet; set them in fetched pages or manage them manually.
- **Non-url loaders** – rely on route attrs; without attrs, title / lang / dir revert to boot and managed tags are cleared.
- **Scripts and styles** – Aura does not reconcile `<script>`, `<link rel="stylesheet">`, or other head assets on navigation.
- **No HTML meta merge** – parent and child HTML meta are not combined.

## Quick reference

| Goal | How |
| ---- | --- |
| Title, description, canonical on a url page | Put them in that HTML file (full `<title>`, including any suffix) |
| Instant tab title while the page loads | `meta-title` on the route, **same text** as the HTML `<title>` |
| Non-url view title | `meta-title` on that route |
| Param update, same shell | `meta-title="User :id"` (HTML is not refetched) |
| Shared suffix for attr titles | `meta-title-template="%s \| App"` on the router – not for fetched HTML pages |
| Different value than the HTML | matching `meta-*` attr; the attr wins, HTML is ignored for that field |
| Opt out of inherit | `meta-*="none"` on the route |
| Custom meta name | `AuraRouter.configure({ documentMeta: { tags: […] } })` |
| Site-wide shell tags | Boot HTML `<head>`, only for slots that no page sets |

---

[← Views and layouts](./03-views-and-layouts.md) · [Guide index](../guide.md) · [Lifecycle and route data →](./05-lifecycle-and-data.md)

# Aura Router – Guide

Aura Router upgrades ordinary HTML pages with client-side navigation. This guide is the canonical documentation for [`@auraui/router`](https://www.npmjs.com/package/@auraui/router).

> **Current release: 0.3.0.** Pin the package version and check the [changelog](../CHANGELOG.md) when upgrading.

New to Aura Router? Complete [Static site → SPA in 10 minutes](./tutorial.md) first, then use these chapters for concepts and API details.

## Read in order

<a id="installation"></a><a id="core-concepts"></a>

1. [Fundamentals](./guide/01-fundamentals.md) — install the package, learn the three elements, and create the first routes.

<a id="defining-routes"></a><a id="navigation"></a><a id="how-href-resolves"></a><a id="route-match-priority"></a><a id="redirects"></a>

2. [Routes and navigation](./guide/02-routes-and-navigation.md) — define paths, upgrade links, understand matching, and redirect.

<a id="views"></a><a id="custom-loaders"></a><a id="extract--fragment-from-full-html-pages"></a><a id="nested-routes--layouts"></a><a id="same-route-updates"></a>

3. [Views and layouts](./guide/03-views-and-layouts.md) — load content, use `extract`, nest routes, and preserve shared layouts.

<a id="document-meta"></a><a id="meta-title"></a><a id="meta-description"></a><a id="meta-canonical"></a><a id="meta-title-template"></a>

4. [Document meta](./guide/04-document-meta.md) — keep title, description, canonical, and social tags in sync on navigation.

<a id="lifecycle-hooks"></a><a id="register-hooks"></a><a id="attach-hooks-to-routes"></a><a id="phase-order-and-inheritance"></a><a id="hook-context"></a><a id="control-navigation"></a><a id="load-route-data"></a><a id="stop-stale-async-work"></a><a id="transitions"></a>

5. [Lifecycle and route data](./guide/05-lifecycle-and-data.md) — add guards, loaders, updates, cleanup, and transitions.

<a id="first-paint-mpa--spa"></a><a id="flat-pages"></a><a id="nested-layouts"></a><a id="adoption-outcomes"></a><a id="after-first-paint"></a>

6. [First paint: MPA → SPA](./guide/06-mpa-to-spa.md) — adopt server-rendered HTML without refetching the current route.

<a id="scroll"></a><a id="scroll-policy"></a><a id="target-and-animation"></a><a id="history-hashes-and-reduced-motion"></a><a id="prefetch"></a><a id="prefetch-modes"></a><a id="policy-cascade"></a><a id="manual-prefetch"></a><a id="safeguards"></a><a id="cache"></a><a id="cache-layers"></a><a id="lifetime-and-identity"></a><a id="invalidate-cached-entries"></a><a id="loading"></a><a id="loading-options"></a><a id="outlet-skeleton"></a><a id="special-cases"></a>

7. [Navigation experience](./guide/07-navigation-ux.md) — configure scroll, prefetch, cache, and loading feedback.

<a id="not-found-404"></a><a id="catch-all-routes"></a><a id="unmatched-url-fallback"></a><a id="custom-404-handling"></a><a id="navigation-errors"></a><a id="active-links--accessibility"></a><a id="configure-active-classes"></a><a id="exact-and-branch-matches"></a><a id="link-scope"></a><a id="read-the-active-route-branch"></a><a id="focus-after-navigation"></a>

8. [Errors and accessibility](./guide/08-errors-and-accessibility.md) — handle 404s and failures, active links, and focus.

<a id="router-defaults"></a><a id="inherited-route-defaults"></a><a id="router-only-settings"></a><a id="override-a-default"></a><a id="programmatic-api"></a><a id="install-and-configure"></a><a id="register-hooks-and-loaders"></a><a id="navigate-and-prefetch"></a><a id="invalidate-refresh-and-fallback"></a><a id="read-runtime-state"></a><a id="change-route-markup"></a><a id="dom-events"></a><a id="compatibility-and-related-links"></a>

9. [API reference](./guide/09-api-reference.md) — look up defaults, methods, events, public types, and compatibility.

Each chapter links to the previous and next chapter. You can follow the guide linearly without choosing between multiple documentation paths.

## Task-focused examples

Use the [recipes](./recipes/README.md) when you want a focused copy-and-paste pattern:

- [Authentication](./recipes/auth.md)
- [Nested layouts](./recipes/nested.md)
- [Prefetch and cache](./recipes/prefetch-cache.md)
- [Not found and errors](./recipes/not-found.md)
- [First paint](./recipes/first-paint.md)

## Related documentation

- [10-minute tutorial](./tutorial.md) — upgrade two complete HTML pages and verify progressive enhancement
- [README](../README.md) — project overview and quick start
- [Known limitations](../LIMITATIONS.md)
- [Security policy](../SECURITY.md)
- [Roadmap](../ROADMAP.md)
- [Changelog](../CHANGELOG.md)

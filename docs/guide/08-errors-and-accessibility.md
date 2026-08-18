# Chapter 8 — Errors and accessibility

Handle missing routes and failures, then keep navigation state accessible.

[← Navigation experience](./07-navigation-ux.md) · [Guide index](../guide.md) · [API reference →](./09-api-reference.md)

---

## Not found (404)

Aura handles two different not-found cases:

- a catch-all route matches and renders a normal application page;
- no route matches, so Aura runs its fallback chain.

### Catch-all routes

Use `path="*"` for the application's normal 404 page:

```html
<aura-route path="*" view="template::not-found"></aura-route>

<template id="not-found"><h1>Page not found</h1></template>
```

A catch-all nested under a parent route can provide section-specific 404 UI. After it commits, Aura dispatches `not-found` with `source: 'route'`. This event is informational and cannot be cancelled.

### Unmatched URL fallback

When no route, including a catch-all, matches the URL, Aura tries these options in order:

1. dispatch cancelable `not-found` with `source: 'fallback'`;
2. if not prevented, call the instance `setNotFoundHandler`;
3. otherwise call the handler from `AuraRouter.configure`;
4. otherwise mount the router's [`error-template`](#navigation-errors);
5. otherwise mount plain `Page not found: …` text.

An `error-template` may contain `[data-not-found-url]`. Aura fills every matching element with the decoded missing URL.

### Custom 404 handling

Use an instance handler when one router needs custom fallback behaviour:

```ts
router.setNotFoundHandler((url) => {
  document.querySelector('aura-outlet')!.textContent = `Missing: ${url}`;
});
```

Pass `null` to clear the instance override. If a global handler is configured through `AuraRouter.configure({ notFoundHandler })`, it becomes active again.

For complete control, listen for fallback `not-found`, render the response, and call `event.preventDefault()`. Preventing the event suppresses every built-in fallback, including handlers and `error-template`.

## Navigation errors

For navigation and rendering failures, inherited `error` hooks receive the normal hook context plus `error`.

`error-template` provides failure UI. It also serves as the final templated fallback when no route matches and no custom 404 handler takes over. It is not a nested error-boundary system.

Aura emits `navigation-error` for a failed navigation. If an `error` hook itself throws, Aura also emits `navigation-hook-error`.

Stable `NavigationFailureCode` values are `NOT_FOUND`, `REDIRECT_CYCLE`, `REDIRECT_DEPTH_EXCEEDED`, `GUARD_THROW`, `HOOK_THROW`, `LOAD_FAILED`, `CONTENT_LOAD_FAILED`, `RENDER_FAILED`, `TRANSITION_FAILED`, `UPDATE_FAILED`, and `INTERNAL`.

## Active links & accessibility

Aura can mark links to the current page and links to its parent sections.

### Configure active classes

Set the class names on `<aura-router>`:

```html
<aura-router
  link-active-class="is-active"
  link-active-branch-class="is-active-branch"
>
</aura-router>
```

When a link becomes exact, Aura adds `aria-current="page"`. It removes the attribute when the link is no longer exact.

### Exact and branch matches

| Match  | Applied state when configured                             |
| ------ | --------------------------------------------------------- |
| Exact  | Exact class, branch class, and `aria-current="page"`      |
| Branch | Branch class only; no `aria-current` for an ancestor link |

An exact match requires the same pathname and query string. A trailing slash is ignored. If either URL has a hash, the hashes must also match.

A branch match requires the current pathname to continue after the link pathname at a segment boundary. For example, `/docs` matches `/docs/guide`, but not `/docs-old`. The root path `/` is not treated as a branch of every page, and an explicit link query must match the current query.

URLs with a hash do not receive branch matches.

### Link scope

`links-container-selector` narrows scanning to the closest matching ancestor of the router. `links-selector` controls both interception and scanning and defaults to `[aura-router-link]`.

### Read the active route branch

The runtime `activeRouteBranch` getter returns the current matched route chain from root to leaf:

```ts
router.activeRouteBranch; // [{ pattern, href }, ...]
```

It updates after navigation settles and when Aura restores the URL after a cancelled navigation.

### Focus after navigation

Aura manages `aria-current`, but does not move focus when a new view commits. When an SPA navigation should announce the new page to keyboard or screen-reader users, use a `ready` hook to focus an appropriate heading or main-content container.

---

[← Navigation experience](./07-navigation-ux.md) · [Guide index](../guide.md) · [API reference →](./09-api-reference.md)

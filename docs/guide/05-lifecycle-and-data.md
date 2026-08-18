# Chapter 5 — Lifecycle and route data

Add guards, data loading, cleanup, updates, and transitions through named hooks.

[← Document meta](./04-document-meta.md) · [Guide index](../guide.md) · [First paint: MPA → SPA →](./06-mpa-to-spa.md)

---

## Lifecycle hooks

Lifecycle hooks run application code at specific points in navigation. Typical uses include authentication, data loading, updating reused DOM, cleanup, analytics, and transitions.

### Register hooks

Give a hook a name and register it once:

```ts
import { AuraRouter, defineRouteHook } from '@auraui/router';

const auth = defineRouteHook('auth', async (ctx) => {
  if (sessionStorage.getItem('auth')) return;
  return '/login';
});

AuraRouter.use(auth);
```

`AuraRouter.use('auth', fn, options)` is the direct registration form. Its options are copied into `ctx.options` for that hook. `AuraRouter.unuse('auth')` removes a registration.

`defineRouteHook(name, fn, { version?, requires? })` defaults the hook version to `1.0.0`. If `requires` is present, registration throws when the current router version does not satisfy that range.

Hook names must start with a letter and may contain lowercase or caseless Unicode letters, digits, and hyphens. Uppercase letters are not accepted.

### Attach hooks to routes

Reference a registered hook by name from the relevant lifecycle attribute:

```html
<aura-route path="/account" view="account.html" guard="auth"></aura-route>
```

An attribute may contain several comma-separated names. They run in declaration order:

```html
<aura-route path="/admin" guard="auth, require-admin"></aura-route>
```

Register hooks before the router connects when its initial navigation needs them.

### Phase order and inheritance

For a normal route change, the main flow is:

`leave` → `guard` → `load` → render and transitions → `unmount` → commit → `ready`

| Attribute        | Purpose                                                      | When / where it runs                   |
| ---------------- | ------------------------------------------------------------ | -------------------------------------- |
| `leave`          | Allow, cancel, or redirect away from active routes           | Active child first, then its parents   |
| `guard`          | Allow, cancel, or redirect into new routes                   | Parents first, then the target child   |
| `load`           | Produce route data before rendering                          | Each newly entered route               |
| `transition-out` | Animate or otherwise present the outgoing view               | Routes being exited                    |
| `transition-in`  | Animate or otherwise present the incoming view               | Routes being entered                   |
| `unmount`        | Clean up resources owned by an exited view                   | Routes being exited                    |
| `ready`          | Run setup, focus, or analytics after the new view commits    | Routes being entered                   |
| `update`         | Apply new data when a same-route view is reused              | The matched route whose view is reused |
| `error`          | Observe or handle a terminal navigation or rendering failure | The route associated with the failure  |

Only `leave` and `guard` can cancel or redirect navigation. `load` is deliberately local to its route; every other phase attribute inherits through parent routes unless overridden.

An in-place [same-route update](./03-views-and-layouts.md#same-route-updates) uses the shorter `load` → `update` flow and does not run the full sequence above.

### Hook context

Every hook receives a context object describing the navigation:

| Field               | What it provides                                                          |
| ------------------- | ------------------------------------------------------------------------- |
| `to`, `from`        | Target and previous `{ pathname, params?, query? }`; `from` may be `null` |
| `route`             | The `<aura-route>` instance whose phase is running                        |
| `phase`             | The current lifecycle phase                                               |
| `data`              | Data produced by the route's load hooks, when available                   |
| `transactionSignal` | An abort signal for navigation superseded by a newer one                  |
| `router`            | `navigate(path, options?)` for programmatic navigation                    |
| `action`            | The current history action                                                |
| `transactionId`     | The current navigation transaction id                                     |
| `options`           | The registration options passed to `AuraRouter.use`                       |
| `parent()`          | In `load` only, await the nearest ancestor's load result                  |
| `error`             | The failure object, available in the `error` phase                        |

### Control navigation

Only `leave` and `guard` use return values to control navigation:

```ts
return true; // continue
return false; // cancel
return '/login'; // redirect
```

Returning nothing also continues navigation. Use an object when you want the result to be explicit or need redirect options:

```ts
return { type: 'cancel', reason: 'unsaved-changes' };
return { type: 'redirect', url: '/login', replace: true };
return { url: '/login', replace: true }; // shorter redirect object
```

All of these forms are intentional parts of the public hook contract. An explicit cancellation passes its optional `reason` to the `navigation-cancel` event; use a stable code rather than user-facing text.

`update`, `ready`, `unmount`, transition, and `error` hooks may be async, but should not return a control value. Aura awaits their completion and ignores the resolved value. Returning cancel or redirect from those phases produces a warning.

### Load route data

A `load` hook's return value is data, not a navigation result: a string remains a string and does not redirect. One load hook produces its value directly; multiple load hooks produce an object keyed by hook name.

Parent and child loads start in parallel. A child waits for its nearest ancestor only when it explicitly calls and awaits `ctx.parent()`.

In TypeScript, use `RouteLoadFn<TData>` to type a load result:

```ts
import { AuraRouter, type RouteLoadFn } from '@auraui/router';

interface Account {
  id: string;
  name: string;
}

const loadAccount: RouteLoadFn<Account> = async (ctx) => {
  const response = await fetch('/api/account', {
    signal: ctx.transactionSignal,
  });
  return response.json() as Promise<Account>;
};

AuraRouter.use('load-account', loadAccount);
```

### Stop stale async work

A newer navigation aborts the previous transaction. Long-running hooks should pass `transactionSignal` to supported APIs and stop custom work when it aborts:

```ts
const response = await fetch('/api/account', {
  signal: ctx.transactionSignal,
});
```

### Transitions

> **0.x note.** Transition attributes and ordering may evolve before `1.0.0`.

Transitions are lifecycle hooks for the outgoing and incoming views. Aura awaits them in the order selected by `transition-order`.

`transition="fade"` uses the same registered hook for both views. Two names assign separate outgoing and incoming hooks: `transition="fade-out, fade-in"`.

| Attribute                         | Meaning                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `transition-in`, `transition-out` | Comma-separated hook names; inherited independently                           |
| `transition`                      | Symmetric or out/in shortcut; inherited                                       |
| `transition-order`                | `parallel` (default when transitions exist), `out-in`, or `in-out`; inherited |

Use `none`, `off`, or `false` to opt out of inherited hooks or transition sides.

---

[← Document meta](./04-document-meta.md) · [Guide index](../guide.md) · [First paint: MPA → SPA →](./06-mpa-to-spa.md)

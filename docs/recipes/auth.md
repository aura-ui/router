# Recipe: Auth guard + protected layout

> **Goal:** Block a route tree until the user is signed in; redirect to `/login`, then enter the protected shell.  
> **Live:** [`playground/`](../../playground/) — from another page, click **Profile** (SPA), then Sign in.  
> **API:** [Lifecycle hooks](../guide.md#lifecycle-hooks) · [Nested routes & layouts](../guide.md#nested-routes--layouts)

---

## What you get

```text
/login            → public
/profile          → needs auth (layout + overview)
/profile/settings → same guard (inherited from parent)
```

Unauthenticated **SPA** navigation to `/profile` → `guard="auth"` returns a redirect → `/login`.  
After Sign in → `navigate('/profile')` → guard passes → layout stays mounted while switching overview ↔ settings.

> **First paint:** a hard reload of `/profile` can **adopt** server HTML and skip `guard` / `load` / `ready`. Put auth in the server response for that URL, or rely on SPA navigations for the guard. See [First paint](./first-paint.md) and [LIMITATIONS](../../LIMITATIONS.md).

---

## 1. Routes

```html
<aura-route path="/login" view="login"></aura-route>

<aura-route path="/profile" layout="profile-layout" guard="auth">
  <aura-route path="." view="profile" extract=".main"></aura-route>
  <aura-route path="settings" view="profile/settings" extract=".main"></aura-route>
</aura-route>

<template id="profile-layout">
  <section class="layout">
    <h2>Profile</h2>
    <nav>
      <a href="/profile" aura-router-link>Overview</a>
      <a href="/profile/settings" aura-router-link>Settings</a>
      <button type="button" data-demo-logout>Log out</button>
    </nav>
    <aura-outlet></aura-outlet>
  </section>
</template>
```

`guard` on the **parent** covers every child. The layout mounts once; only the outlet content swaps.

---

## 2. Guard hook

```js
import { AuraRouter, defineRouteHook } from '@auraui/router';

const AUTH_KEY = 'aura-demo-auth';

AuraRouter.use(
  defineRouteHook('auth', async () => {
    if (sessionStorage.getItem(AUTH_KEY) === '1') return;
    return { type: 'redirect', url: '/login', replace: true };
  }),
);

AuraRouter.install();
```

| Return | Effect |
| --- | --- |
| `undefined` / nothing | Allow navigation |
| `{ type: 'redirect', url, replace? }` | Abort and go to `url` |

Use your real session check (cookie, token, `fetch('/api/me')`) instead of `sessionStorage`.

---

## 3. Login / logout (app code)

```js
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-demo-login]')) {
    sessionStorage.setItem(AUTH_KEY, '1');
    document.querySelector('aura-router')?.navigate('/profile');
    return;
  }
  if (event.target.closest('[data-demo-logout]')) {
    sessionStorage.removeItem(AUTH_KEY);
    document.querySelector('aura-router')?.navigate('/login');
  }
});
```

```html
<!-- /login page -->
<button type="button" data-demo-login>Sign in</button>
```

The router does not own “login forms” — it only runs `guard` before enter. Session write + `navigate` stay in your app.

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. Open `/` or `/about`, then click **Profile** in the nav (SPA) → redirect to `/login`.
2. Click **Sign in** → `/profile` with the layout shell.
3. Switch **Settings** → layout stays; outlet updates.
4. **Log out** → `/login`; click **Profile** again → blocked.

---

## See also

- [Recipes index](./README.md)
- Full reference app: [`playground/pages/parts/router.html`](../../playground/pages/parts/router.html)
- Hook registration: [`playground/src/main.js`](../../playground/src/main.js)
- Guide: [Lifecycle hooks](../guide.md#lifecycle-hooks)

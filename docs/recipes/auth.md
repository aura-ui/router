# Recipe: Auth guard + protected layout

> **Goal:** Block a route tree until the user is signed in; redirect to `/login`, then enter the protected shell.  
> **Live:** [`playground/`](../../playground/) — from another page, click **Profile**, then Sign in.  
> **API:** [Lifecycle hooks](../guide.md#lifecycle-hooks) · [Nested routes & layouts](../guide.md#nested-routes--layouts)

---

## What you get

```text
/login            → public
/profile          → needs auth (layout + overview)
/profile/settings → same guard (inherited from parent)
```

**SPA** navigation to `/profile` without a session → `guard="auth"` redirects to `/login`.  
After Sign in → layout stays mounted; overview ↔ settings swap in the outlet.

> **Adopt vs guard:** successful first-paint adopt skips `guard` / `load` / `ready`. That applies to **flat** routes adopted via `extract` (or `aura-router-ssr`). Playground `/profile` is **nested** with flat server markup, so a hard reload usually runs a normal first navigation — **guard still runs**. See [First paint](./first-paint.md).

---

## 1. Routes

```html
<aura-route path="/login" view="login"></aura-route>

<aura-route path="/profile" layout="profile-layout" guard="auth">
  <aura-route path="." view="profile"></aura-route>
  <aura-route path="settings" view="profile/settings"></aura-route>
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

`guard` on the parent covers every child. Router-level `extract` (if any) is inherited — no need to repeat it on children.

---

## 2. Guard + login

```js
import { AuraRouter } from '@auraui/router';

const AUTH_KEY = 'aura-demo-auth';

AuraRouter.use('auth', () => {
  if (sessionStorage.getItem(AUTH_KEY) === '1') return;
  return { type: 'redirect', url: '/login', replace: true };
});

AuraRouter.install();

document.addEventListener('click', (e) => {
  const el = e.target instanceof Element ? e.target : null;
  const router = document.querySelector('aura-router');
  if (el?.closest('[data-demo-login]')) {
    sessionStorage.setItem(AUTH_KEY, '1');
    router?.navigate('/profile');
  } else if (el?.closest('[data-demo-logout]')) {
    sessionStorage.removeItem(AUTH_KEY);
    router?.navigate('/login');
  }
});
```

```html
<button type="button" data-demo-login>Sign in</button>
```

| Guard return | Effect |
| --- | --- |
| nothing / `undefined` | Allow |
| `{ type: 'redirect', url, replace? }` | Navigate to `url` |

Replace `sessionStorage` with your real session check in production.

---

## Try it

```bash
cd playground && npm install && npm run dev
```

1. From `/` or `/about`, click **Profile** (SPA) → `/login`.
2. **Sign in** → `/profile`.
3. In the profile subnav, open **Settings** → layout stays.
4. **Log out** → click **Profile** again → blocked.

---

## See also

- [Recipes index](./README.md)
- [`playground/pages/parts/router.html`](../../playground/pages/parts/router.html) · [`playground/src/main.js`](../../playground/src/main.js)
- Guide: [Lifecycle hooks](../guide.md#lifecycle-hooks)

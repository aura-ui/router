# Recipe: Auth guard + protected layout

> **Goal:** Block a route tree until the user is signed in; redirect to `/login`, then enter the protected shell.  
> **Live:** [`playground/`](../../playground/) — from another page, click **Profile**, then Sign in.  
> **API:** [Control navigation](../guide.md#control-navigation) · [Nested routes & layouts](../guide.md#nested-routes--layouts)

---

## Result

```text
/login            → public
/profile          → needs auth (layout + overview)
/profile/settings → same guard (inherited from parent)
```

During SPA navigation, `guard="auth"` checks the session before Aura enters `/profile`. The guard is inherited by both child routes. After sign-in, the profile layout stays mounted while its outlet switches between overview and settings.

---

## 1. Define the protected routes

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

Putting `guard="auth"` on the parent protects the complete branch. The layout must contain `<aura-outlet>` for its child page.

---

## 2. Register the guard

```js
import { AuraRouter } from '@auraui/router';

const AUTH_KEY = 'aura-demo-auth';

AuraRouter.use('auth', () => {
  if (sessionStorage.getItem(AUTH_KEY) === '1') return;
  return { type: 'redirect', url: '/login', replace: true };
});

AuraRouter.install();
```

Returning nothing allows navigation. The redirect object sends unauthenticated users to `/login`; `replace: true` requests history replacement instead of adding another entry. Aura does not commit the blocked `/profile` URL before resolving the redirect.

## 3. Add login and logout actions

In the same module, reuse `AUTH_KEY` from the guard:

```js
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

Replace `sessionStorage` with your real session source.

## Important: guards are not server security

A guard controls client navigation; it does not protect HTML or API responses. Your server must still enforce authorization.

Successful [first-paint adoption](./first-paint.md) skips `guard`, `load`, and `ready` because the server has already supplied the active page. The server must therefore make the access decision before returning protected markup.

---

## Try it

Complete the [one-time playground setup](./README.md#one-time-playground-setup) first.

```bash
cd playground
npm run dev
```

1. From `/` or `/about`, click **Profile** (SPA) → `/login`.
2. **Sign in** → `/profile`.
3. In the profile subnav, open **Settings** → layout stays.
4. **Log out** → click **Profile** again → blocked.

Use SPA links for this guard demonstration. A hard reload of `/profile` can adopt the server HTML and skip the guard; the playground server intentionally does not implement real authorization.

---

## See also

- [Recipes index](./README.md)
- [`playground/pages/parts/router.html`](../../playground/pages/parts/router.html) · [`playground/src/main.js`](../../playground/src/main.js)
- Guide: [Control navigation](../guide.md#control-navigation)

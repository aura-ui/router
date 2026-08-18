# Recipe: Auth guard

> **Goal:** Redirect signed-out users to `/login` before they enter `/profile`.
> **Live:** In [`playground/`](../../playground/), click **Profile**, then **Sign in**.
> **API:** [Control navigation](../guide/05-lifecycle-and-data.md#control-navigation)

## 1. Protect the route

```html
<aura-route path="/login" view="login"></aura-route>
<aura-route path="/profile" view="profile" guard="auth"></aura-route>
```

`guard="auth"` refers to the registered hook named `auth`.

## 2. Register the guard

```js
import { AuraRouter } from '@auraui/router';

const AUTH_KEY = 'aura-demo-auth';

AuraRouter.use('auth', () => sessionStorage.getItem(AUTH_KEY) === '1' || '/login');

AuraRouter.install();
```

The guard returns `true` when access is allowed and `/login` when Aura should redirect.

## 3. Continue after sign-in

After your login request succeeds:

```js
sessionStorage.setItem(AUTH_KEY, '1');
document.querySelector('aura-router')?.navigate('/profile');
```

Replace `sessionStorage` with your real session source.

> **Security:** A guard controls client navigation, not access to HTML or API data. Protect those on the server. Successful [first-paint adoption](./first-paint.md) skips guards because the server has already returned the active page.

To protect a complete nested branch, put `guard="auth"` on its parent route; see the [nested layout recipe](./nested.md).

## See also

- [Recipes index](./README.md)
- [Playground implementation](../../playground/src/main.js)
- Guide: [Control navigation](../guide/05-lifecycle-and-data.md#control-navigation)

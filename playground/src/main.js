import { AuraRouter, defineRouteHook } from '@auraui/router';

const AUTH_KEY = 'aura-demo-auth';

const authHook = defineRouteHook('auth', async () => {
  if (sessionStorage.getItem(AUTH_KEY) === '1') return;
  console.log('auth — redirect to /login');
  return { type: 'redirect', url: '/login', replace: true };
});

AuraRouter.use(authHook);

AuraRouter.use('show-user', async (ctx) => {
  const id = ctx.to.params?.id;
  console.log(`User id: ${id}`);
});

AuraRouter.install();

function router() {
  return document.querySelector('aura-router');
}

document.addEventListener('click', (event) => {
  const login = event.target.closest('[data-demo-login]');
  if (login) {
    sessionStorage.setItem(AUTH_KEY, '1');
    router()?.navigate('/profile');
    return;
  }

  const logout = event.target.closest('[data-demo-logout]');
  if (logout) {
    sessionStorage.removeItem(AUTH_KEY);
    router()?.navigate('/login');
  }
});

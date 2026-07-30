import { AuraRouter } from '@auraui/router';

const AUTH_KEY = 'aura-demo-auth';

AuraRouter.use('auth', () => {
  if (sessionStorage.getItem(AUTH_KEY) === '1') return;
  return { type: 'redirect', url: '/login', replace: true };
});

AuraRouter.use('show-user', (ctx) => {
  console.log(`User id: ${ctx.to.params?.id}`);
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

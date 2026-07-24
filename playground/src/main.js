import { AuraRouter, defineRouteHook } from '@auraui/router';

const authHook = defineRouteHook('auth', async () => {
  console.log('auth - redirect');
  // return false;
  return { type: 'redirect', url: '/login', replace: true };
});

AuraRouter.use(authHook);

AuraRouter.use('show-user', async (ctx) => {
  const id = ctx.to.params?.id;
  console.log(`User id: ${id}`);
  // обновить DOM / запросить данные
});

AuraRouter.install();
import { AuraRouter } from '../../modules/aura-router/core';
import { defaultLoaderRegistry } from '../../modules/aura-route/core';
import { authHook, type AuthHookOptions } from './hooks/auth.hook';
import { analyticsHook } from './hooks/analytics.hook';
import { fadeTransitionHook, slideTransitionHook } from './hooks/view-transition.hook';

defaultLoaderRegistry.register('custom-loader', async () => 'custom loader content');

AuraRouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AuraRouter.use(analyticsHook);
AuraRouter.use(fadeTransitionHook);
AuraRouter.use(slideTransitionHook);
AuraRouter.install();

const router = document.querySelector<AuraRouter>(AuraRouter.is);

function restartRouter(nextPolicy?: string): void {
  if (!router?.parentNode) return;

  if (nextPolicy) {
    router.setAttribute('data-transition', nextPolicy);
  }

  const parent = router.parentNode;
  const anchor = router.nextSibling;
  router.remove();
  if (anchor) parent.insertBefore(router, anchor);
  else parent.appendChild(router);

  const path = location.pathname.startsWith('/t/') ? location.pathname : '/t/home';
  router.navigate(path, { replace: true, syncHistory: true });
}

document.querySelectorAll<HTMLButtonElement>('[data-transition-policy]').forEach((button) => {
  button.addEventListener('click', () => {
    const policy = button.dataset.transitionPolicy;
    if (!policy) return;

    document.querySelectorAll('[data-transition-policy]').forEach((el) => {
      el.classList.toggle('is-active', el === button);
    });

    restartRouter(policy);
  });
});

if (location.pathname.startsWith('/t/')) {
  const active = document.querySelector(
    `[data-transition-policy="${router?.getAttribute('data-transition') ?? 'parallel'}"]`,
  );
  active?.classList.add('is-active');
}

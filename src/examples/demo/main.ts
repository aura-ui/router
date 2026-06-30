import { AuraRouter } from '../../modules/aura-router/core';
import { defaultLoaderRegistry } from '../../modules/aura-route/core';
import { customLoader, CUSTOM_LOADER_TYPE } from './loaders/custom-loader';
import { authHook, type AuthHookOptions } from './hooks/auth.hook';
import { analyticsHook } from './hooks/analytics.hook';
import { fadeTransitionHook, slideTransitionHook } from './hooks/view-transition.hook';

defaultLoaderRegistry.register(CUSTOM_LOADER_TYPE, customLoader);

AuraRouter.configure({
  dataCache: { max: 50, gcTime: Infinity, gcSweepInterval: false },
  viewCache: { max: 10, gcTime: Infinity, gcSweepInterval: false },
});

AuraRouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AuraRouter.use(analyticsHook);
AuraRouter.use(fadeTransitionHook);
AuraRouter.use(slideTransitionHook);
AuraRouter.install();

const router = document.querySelector<AuraRouter>(AuraRouter.is);
const pathLabel = document.getElementById('demo-current-path');
const policyButtons = document.querySelectorAll<HTMLButtonElement>('[data-transition-policy]');

function syncTransitionPolicyUi(activePolicy: string): void {
  policyButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.transitionPolicy === activePolicy);
  });
}

function updateChrome(): void {
  const path = location.pathname;
  pathLabel && (pathLabel.textContent = path);

  document.querySelectorAll<HTMLAnchorElement>('[data-router-link]').forEach((link) => {
    if (link.pathname === path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function restartRouter(nextPolicy: string): void {
  if (!router?.parentNode) return;

  router.setAttribute('data-transition', nextPolicy);
  syncTransitionPolicyUi(nextPolicy);

  const parent = router.parentNode;
  const anchor = router.nextSibling;
  router.remove();
  if (anchor) parent.insertBefore(router, anchor);
  else parent.appendChild(router);

  const path = location.pathname.startsWith('/t/') ? location.pathname : '/t/home';
  router.navigate(path, { replace: true, syncHistory: true });
}

document.addEventListener('click', (event) => {
  const target = event.target as Element;
  const policyButton = target.closest<HTMLButtonElement>('[data-transition-policy]');

  if (policyButton?.dataset.transitionPolicy) {
    restartRouter(policyButton.dataset.transitionPolicy);
    return;
  }

  if (target.closest('[data-router-link]')) {
    queueMicrotask(updateChrome);
  }
});

syncTransitionPolicyUi(router?.getAttribute('data-transition') ?? 'parallel');
updateChrome();
window.addEventListener('popstate', updateChrome);

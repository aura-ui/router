import { AuraRoute } from '../../modules/aura-route/core/aura-route';
import {
  AuraRouter,
  AURA_ROUTER_NAVIGATION,
} from '../../modules/aura-router/core';

import { installAnimationsDemoControls, syncAnimationsOrderUi } from './animations-demo';
import { renderRouteFacts, installDemoRouteFactsObserver } from './demo-route-facts';
import { syncRouteParams } from './demo-route-params';
import { highlightDemoCode } from './highlight-code';
import { installDemoTransitionHooks } from './hooks/view-transition';
import { highlightDemoOutlets, installDemoShell } from './outlet-demo';

installDemoShell();
installDemoRouteFactsObserver();
installDemoTransitionHooks();
AuraRouter.install();
void customElements.whenDefined(AuraRoute.is).then(() => {
  installAnimationsDemoControls();
  // Hydrate boot skips `navigation` — refresh chrome / code after adopt settles.
  scheduleDemoUiRefresh();
  setTimeout(refreshDemoUi, 50);
});

function scheduleDemoUiRefresh(): void {
  queueMicrotask(refreshDemoUi);
  setTimeout(refreshDemoUi, 0);
}

function syncSiteUrl(): void {
  const urlEl = document.getElementById('demo-site-url');
  if (urlEl) urlEl.textContent = location.pathname + location.search + location.hash;
}

function refreshDemoUi(): void {
  syncSiteUrl();
  renderRouteFacts();
  syncRouteParams(document);
  syncAnimationsOrderUi(document);
  highlightDemoOutlets();
  highlightDemoCode(document);
}

const router = document.querySelector('aura-router');
if (router) {
  router.addEventListener(AURA_ROUTER_NAVIGATION, () => {
    refreshDemoUi();
  });
}

document.addEventListener(
  'click',
  (event) => {
    if ((event.target as Element).closest('[data-aura-link]')) {
      scheduleDemoUiRefresh();
    }
  },
  true,
);

window.addEventListener('hashchange', refreshDemoUi);
window.addEventListener('popstate', refreshDemoUi);

refreshDemoUi();

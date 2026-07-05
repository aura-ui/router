import {
  AuraRouter,
  AURA_ROUTER_NAVIGATION,
  type AuraRouterNavigationEvent,
} from '../../modules/aura-router/core';
import { highlightDemoCode } from './highlight-code';

AuraRouter.install();

const router = document.querySelector<AuraRouter>(AuraRouter.is);
let currentPath = location.pathname;

function syncActiveLinks(): void {
  const path = currentPath;

  document.querySelectorAll<HTMLAnchorElement>('[data-router-link]').forEach((link) => {
    const linkPath = link.pathname;
    const active =
      linkPath === path ||
      (linkPath === '/features/routing' &&
        (path === '/features/routing' || path === '/features/routing/index.html')) ||
      (linkPath !== '/' && linkPath !== '/features/routing' && path.startsWith(linkPath + '/'));

    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function syncSiteUrl(): void {
  const urlEl = document.getElementById('demo-site-url');
  if (urlEl) urlEl.textContent = currentPath;
}

function refreshDemoUi(): void {
  syncActiveLinks();
  syncSiteUrl();
  highlightDemoCode(document);
}

router?.addEventListener(AURA_ROUTER_NAVIGATION, (event) => {
  const { pathname } = (event as AuraRouterNavigationEvent).detail;
  currentPath = pathname;
  refreshDemoUi();
});

window.addEventListener('popstate', () => {
  currentPath = location.pathname;
  refreshDemoUi();
});

const outlet = document.querySelector('.demo-site-outlet');
if (outlet) {
  new MutationObserver(() => highlightDemoCode(outlet)).observe(outlet, {
    childList: true,
    subtree: true,
  });
}

refreshDemoUi();

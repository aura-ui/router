import { AuraRouter } from '../../modules/aura-router/core';
import { highlightDemoCode } from './highlight-code';

AuraRouter.install();

function syncActiveLinks(): void {
  const path = location.pathname;

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
  if (urlEl) urlEl.textContent = location.pathname;
}

function refreshDemoUi(): void {
  syncActiveLinks();
  syncSiteUrl();
  highlightDemoCode(document);
}

document.addEventListener('click', (event) => {
  if ((event.target as Element).closest('[data-router-link]')) {
    queueMicrotask(refreshDemoUi);
  }
});

window.addEventListener('popstate', refreshDemoUi);

const outlet = document.querySelector('.demo-site-outlet');
if (outlet) {
  new MutationObserver(() => refreshDemoUi()).observe(outlet, {
    childList: true,
    subtree: true,
  });
}

refreshDemoUi();

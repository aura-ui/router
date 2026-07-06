import {
  AuraRouter,
  AURA_ROUTER_NAVIGATION,
} from '../../modules/aura-router/core';
import { AuraRoute } from '../../modules/aura-route/core/aura-route';
import { installAnimationsDemoControls, syncAnimationsOrderUi } from './animations-demo';
import { installDemoTransitionHooks } from './hooks/view-transition';
import { DEMO_ROOTS } from './demo-scenarios';
import { renderRouteFacts, installDemoRouteFactsObserver } from './demo-route-facts';
import { syncRouteParams } from './demo-route-params';
import { highlightDemoCode } from './highlight-code';
import { highlightDemoOutlets, installDemoShell } from './outlet-demo';

installDemoShell();
installDemoRouteFactsObserver();
installDemoTransitionHooks();
AuraRouter.install();
void customElements.whenDefined(AuraRoute.is).then(() => {
  installAnimationsDemoControls();
});

function isDemoRoot(linkPath: string): boolean {
  return DEMO_ROOTS.includes(linkPath);
}

function getPhaseUpdateSection(pathname: string): string | null {
  const match = pathname.match(/\/features\/phase-update\/(search|hash|remount|update)(?:\/|$)/);
  return match?.[1] ?? null;
}

function scheduleDemoUiRefresh(): void {
  queueMicrotask(refreshDemoUi);
  setTimeout(refreshDemoUi, 0);
}

function syncActiveLinks(): void {
  const path = location.pathname;
  const search = location.search;
  const hash = location.hash;
  const pathSection = getPhaseUpdateSection(path);

  document.querySelectorAll<HTMLAnchorElement>('[data-router-link]').forEach((link) => {
    const linkPath = link.pathname;
    const linkSearch = link.search;
    const linkHash = link.hash;
    const isSiteNav = link.closest('.demo-site-nav') !== null;
    const linkSection = getPhaseUpdateSection(linkPath);

    const exactMatch = linkHash
      ? linkPath === path && linkSearch === search && linkHash === hash
      : linkPath === path && linkSearch === search && hash === '';

    const indexMatch =
      linkSearch === search &&
      linkHash === hash &&
      isDemoRoot(linkPath) &&
      (path === linkPath || path === `${linkPath}/index.html`);

    const prefixMatch =
      linkSearch === '' &&
      linkHash === '' &&
      !isDemoRoot(linkPath) &&
      linkPath !== '/' &&
      path.startsWith(linkPath + '/');

    const siteNavMatch =
      isSiteNav &&
      linkSection != null &&
      linkSection === pathSection;

    const active = exactMatch || indexMatch || prefixMatch || siteNavMatch;

    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function syncSiteUrl(): void {
  const urlEl = document.getElementById('demo-site-url');
  if (urlEl) urlEl.textContent = location.pathname + location.search + location.hash;
}

function refreshDemoUi(): void {
  syncActiveLinks();
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
    if ((event.target as Element).closest('[data-router-link]')) {
      scheduleDemoUiRefresh();
    }
  },
  true,
);

window.addEventListener('hashchange', refreshDemoUi);
window.addEventListener('popstate', refreshDemoUi);

refreshDemoUi();

import {
  AuraRouter,
  AURA_ROUTER_NAVIGATION,
} from '../../modules/aura-router/core';
import { DEMO_ROOTS } from './demo-scenarios';
import { renderRouteFacts } from './demo-route-facts';
import { highlightDemoCode } from './highlight-code';
import { highlightDemoOutlets, installDemoShell } from './outlet-demo';

installDemoShell();
AuraRouter.install();

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

function syncRouteParams(): void {
  const path = location.pathname;
  const search = new URLSearchParams(location.search);

  document.querySelectorAll<HTMLElement>('[data-demo-param]').forEach((el) => {
    const key = el.dataset.demoParam;
    if (!key) return;

    if (key === 'id') {
      const match =
        path.match(/\/users\/([^/]+)(?:\/|$)/)
        ?? path.match(/\/phase-update\/(?:remount|update)\/([^/]+)(?:\/|$)/);
      el.textContent = match?.[1] ?? '—';
      return;
    }

    if (key === 'tab') {
      el.textContent = search.get('tab') ?? 'info';
      return;
    }

    if (key === 'section') {
      el.textContent = location.hash.slice(1) || '—';
    }
  });
}

function refreshDemoUi(): void {
  syncActiveLinks();
  syncSiteUrl();
  renderRouteFacts();
  syncRouteParams();
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

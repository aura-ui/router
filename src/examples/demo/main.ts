import {
  AuraRouter,
  AURA_ROUTER_NAVIGATION,
} from '../../modules/aura-router/core';
import { highlightDemoCode } from './highlight-code';

AuraRouter.install();

const DEMO_ROOTS = [
  '/features/routing-basics',
  '/features/routing-nested',
  '/features/routing-advanced',
  '/features/phase-update',
];

function isDemoRoot(linkPath: string): boolean {
  return DEMO_ROOTS.includes(linkPath);
}

function syncActiveLinks(): void {
  const path = location.pathname;
  const search = location.search;

  document.querySelectorAll<HTMLAnchorElement>('[data-router-link]').forEach((link) => {
    const linkPath = link.pathname;
    const linkSearch = link.search;

    const exactMatch = linkPath === path && linkSearch === search;
    const indexMatch =
      linkSearch === search &&
      isDemoRoot(linkPath) &&
      (path === linkPath || path === `${linkPath}/index.html`);
    const prefixMatch =
      linkSearch === '' &&
      !isDemoRoot(linkPath) &&
      linkPath !== '/' &&
      path.startsWith(linkPath + '/');

    const active = exactMatch || indexMatch || prefixMatch;

    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function syncSiteUrl(): void {
  const urlEl = document.getElementById('demo-site-url');
  if (urlEl) urlEl.textContent = location.pathname + location.search;
}

function syncRouteParams(): void {
  const path = location.pathname;
  const search = new URLSearchParams(location.search);

  document.querySelectorAll<HTMLElement>('[data-demo-param]').forEach((el) => {
    const key = el.dataset.demoParam;
    if (!key) return;

    if (key === 'id') {
      const match = path.match(/\/users\/([^/]+)(?:\/|$)/);
      el.textContent = match?.[1] ?? '—';
      return;
    }

    if (key === 'tab') {
      el.textContent = search.get('tab') ?? 'info';
    }
  });
}

function refreshDemoUi(): void {
  syncActiveLinks();
  syncSiteUrl();
  syncRouteParams();
  highlightDemoCode(document);
}

const router = document.querySelector('aura-router');
if (router) {
  router.addEventListener(AURA_ROUTER_NAVIGATION, () => {
    refreshDemoUi();
  });
}

refreshDemoUi();

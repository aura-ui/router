import { AuraRouter } from '../../modules/aura-router/core';
import {
  AURA_ROUTER_NAVIGATION_ERROR,
  AURA_ROUTER_NOT_FOUND,
} from '../../modules/aura-router/core/navigation-events';
import { defaultLoaderRegistry } from '../../modules/aura-route/core';
import { customLoader, CUSTOM_LOADER_TYPE } from './loaders/custom-loader';
import { slowLoader, SLOW_LOADER_TYPE } from './loaders/slow-loader';
import { authHook, type AuthHookOptions } from './hooks/auth.hook';
import { analyticsHook } from './hooks/analytics.hook';
import { userStatsHook } from './hooks/user-stats.hook';
import { fadeTransitionHook, slideTransitionHook } from './hooks/view-transition.hook';
import { demoAuthEnabled, setDemoAuth } from './demo-state';
import { resolveScenario } from './scenarios';
import { storyForPath } from './stories';
import { DemoTour, isTourDone } from './tour';

defaultLoaderRegistry.register(CUSTOM_LOADER_TYPE, customLoader);
defaultLoaderRegistry.register(SLOW_LOADER_TYPE, slowLoader);

AuraRouter.configure({
  dataCache: { max: 50, gcTime: Infinity, gcSweepInterval: false },
  viewCache: { max: 10, gcTime: Infinity, gcSweepInterval: false },
});

AuraRouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AuraRouter.use(analyticsHook);
AuraRouter.use(userStatsHook);
AuraRouter.use(fadeTransitionHook);
AuraRouter.use(slideTransitionHook);
AuraRouter.install();

type LogKind = 'nav' | 'auth' | 'error' | 'system';
type LogEntry = { time: string; message: string; kind: LogKind };

const router = document.querySelector<AuraRouter>(AuraRouter.is);
const pathLabel = document.getElementById('demo-current-path');
const urlBadge = document.getElementById('demo-url-badge');
const urlCopyBtn = document.getElementById('demo-url-copy') as HTMLButtonElement | null;
const routeRecipe = document.getElementById('demo-route-recipe');
const logList = document.getElementById('demo-log-list');
const authToggle = document.getElementById('demo-auth-toggle') as HTMLButtonElement | null;
const authStatus = document.getElementById('demo-auth-status');
const policyButtons = document.querySelectorAll<HTMLButtonElement>('[data-transition-policy]');
const topbarTagline = document.getElementById('topbar-tagline');
const devToggle = document.getElementById('demo-dev-toggle') as HTMLButtonElement | null;

const storyBar = document.getElementById('demo-story-bar');
const storyTitle = document.getElementById('demo-story-title');
const storyTry = document.getElementById('demo-story-try');
const storyWatch = document.getElementById('demo-story-watch');
const storyExtras = document.getElementById('demo-story-extras');
const devPanel = document.getElementById('demo-dev-panel');
const tourRoot = document.getElementById('demo-tour-root');

const MAX_LOG = 12;
const logEntries: LogEntry[] = [];
let lastPath = location.pathname;
let urlPulseTimer = 0;
let scrollListenerAttached = false;
let devPanelOpen = false;

const tour = tourRoot ? new DemoTour(tourRoot) : null;

function isDevDetailPath(path: string): boolean {
  return (
    path.startsWith('/dev') ||
    path.startsWith('/loaders/') ||
    path.startsWith('/ux/') ||
    path.startsWith('/hooks/data')
  );
}

function isTransitionPath(path: string): boolean {
  return path.startsWith('/t/');
}

function setPageMode(path: string): void {
  const story = storyForPath(path);
  const isHome = path === '/';

  document.body.classList.toggle('mode-home', isHome);
  document.body.classList.toggle('mode-story', !isHome);
  document.body.classList.toggle('mode-dev-detail', isDevDetailPath(path));
  document.body.classList.toggle('show-auth', !!story?.showAuth);

  if (topbarTagline) {
    topbarTagline.textContent = isHome ? 'Страницы без перезагрузки' : (story?.title ?? 'Демо');
  }

  if (devToggle) {
    if (isHome) devToggle.setAttribute('hidden', '');
    else devToggle.removeAttribute('hidden');
    devToggle.classList.toggle('is-active', devPanelOpen && !devPanel?.hasAttribute('hidden'));
  }

  if (storyBar) {
    if (isHome) storyBar.setAttribute('hidden', '');
    else storyBar.removeAttribute('hidden');
  }

  if (storyExtras) {
    if (isTransitionPath(path)) storyExtras.removeAttribute('hidden');
    else storyExtras.setAttribute('hidden', '');
  }

  if (story && storyTitle) storyTitle.textContent = `${story.icon} ${story.title}`;
  if (story && storyTry) storyTry.textContent = story.try;
  if (story && storyWatch) storyWatch.textContent = story.watch;

  syncScrollUi(path);
}

function formatRecipe(recipe: string): string {
  const inner = recipe
    .split(/\s+(?=\w+=)/)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return part;
      return `<em>${part.slice(0, eq)}</em>=${part.slice(eq + 1)}`;
    })
    .join(' ');
  return `&lt;aura-route ${inner}&gt;`;
}

function pushLog(message: string, kind: LogKind = 'system'): void {
  const time = new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  logEntries.unshift({ time, message, kind });
  if (logEntries.length > MAX_LOG) logEntries.length = MAX_LOG;
  if (!logList) return;
  logList.replaceChildren(
    ...logEntries.map((entry) => {
      const li = document.createElement('li');
      li.dataset.kind = entry.kind;
      li.textContent = `${entry.time} — ${entry.message}`;
      return li;
    }),
  );
}

function syncAuthUi(): void {
  authToggle?.classList.toggle('is-on', demoAuthEnabled);
  if (authToggle) authToggle.textContent = demoAuthEnabled ? 'Выйти' : 'Войти';
  if (authStatus) {
    authStatus.textContent = demoAuthEnabled ? 'Авторизован' : 'Гость';
    authStatus.dataset.state = demoAuthEnabled ? 'on' : 'off';
  }
}

function syncTransitionPolicyUi(activePolicy: string): void {
  policyButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.transitionPolicy === activePolicy);
  });
}

function pulseUrlBar(): void {
  pathLabel?.classList.add('is-pulse');
  urlBadge?.removeAttribute('hidden');
  window.clearTimeout(urlPulseTimer);
  urlPulseTimer = window.setTimeout(() => {
    pathLabel?.classList.remove('is-pulse');
    urlBadge?.setAttribute('hidden', '');
  }, 2200);
}

function focusSceneTitle(): void {
  requestAnimationFrame(() => {
    const title = document.querySelector<HTMLElement>('.stage__viewport .scene__title');
    if (!title) return;
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  });
}

function syncScrollUi(path: string): void {
  const onScrollPage = path === '/ux/scroll';

  if (onScrollPage && !scrollListenerAttached) {
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    scrollListenerAttached = true;
    updateScrollProgress();
  }

  if (!onScrollPage && scrollListenerAttached) {
    window.removeEventListener('scroll', updateScrollProgress);
    scrollListenerAttached = false;
  }
}

function updateScrollProgress(): void {
  const hint = document.querySelector<HTMLElement>('[data-scroll-hint]');
  const bar = document.querySelector<HTMLElement>('.scroll-progress__bar');
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;

  if (bar) bar.style.width = `${pct}%`;
  if (hint) {
    hint.textContent =
      pct >= 95
        ? `Прокрутка: ${pct}% — уйдите на главную и вернитесь для restore`
        : `Прокрутка: ${pct}% — прокрутите до конца для проверки restore`;
  }
}

function setDevPanelOpen(open: boolean): void {
  devPanelOpen = open;
  if (!devPanel) return;
  if (open) devPanel.removeAttribute('hidden');
  else devPanel.setAttribute('hidden', '');
  devToggle?.classList.toggle('is-active', open);
}

function updateChrome(): void {
  const path = location.pathname;

  if (pathLabel) {
    pathLabel.textContent = path;
    pathLabel.title = path;
  }
  if (path !== lastPath) {
    lastPath = path;
    if (path !== '/') pulseUrlBar();
    focusSceneTitle();
  }

  setPageMode(path);

  const scenario = resolveScenario(path);
  if (routeRecipe) routeRecipe.innerHTML = formatRecipe(scenario.recipe);

  document.querySelectorAll<HTMLAnchorElement>('[data-router-link]').forEach((link) => {
    const linkPath = link.pathname;
    const active =
      linkPath === path ||
      (linkPath !== '/' && path.startsWith(linkPath + '/')) ||
      (linkPath.startsWith('/routing/user/') && path.startsWith('/routing/user/'));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function goHome(): void {
  setDevPanelOpen(false);
  router?.navigate('/', { syncHistory: true });
}

function restartRouter(nextPolicy: string): void {
  if (!router?.parentNode) return;
  router.setAttribute('transition-order', nextPolicy);
  syncTransitionPolicyUi(nextPolicy);
  const parent = router.parentNode;
  const anchor = router.nextSibling;
  router.remove();
  if (anchor) parent.insertBefore(router, anchor);
  else parent.appendChild(router);
  const path = location.pathname.startsWith('/t/') ? location.pathname : '/t/home';
  router.navigate(path, { replace: true, syncHistory: true });
  pushLog(`Анимация: ${nextPolicy}`, 'system');
}

async function copyCurrentUrl(): Promise<void> {
  const url = `${location.origin}${location.pathname}${location.search}${location.hash}`;
  try {
    await navigator.clipboard.writeText(url);
    urlCopyBtn?.classList.add('is-copied');
    urlCopyBtn && (urlCopyBtn.textContent = '✓');
    window.setTimeout(() => {
      urlCopyBtn?.classList.remove('is-copied');
      if (urlCopyBtn) urlCopyBtn.textContent = 'Копировать';
    }, 1600);
    pushLog('URL скопирован', 'system');
  } catch {
    pushLog('Не удалось скопировать URL', 'error');
  }
}

if (router) {
  const nativePrefetch = router.prefetch.bind(router);
  router.prefetch = async (href, options) => {
    pushLog(`Prefetch ${href}${options?.mode ? ` (${options.mode})` : ''}`, 'system');
    return nativePrefetch(href, options);
  };
}

router?.addEventListener(AURA_ROUTER_NOT_FOUND, (event) => {
  const { url, source } = (event as CustomEvent<{ url: string; source: string }>).detail;
  pushLog(`404 (${source}): ${url}`, 'error');
  queueMicrotask(updateChrome);
});

router?.addEventListener(AURA_ROUTER_NAVIGATION_ERROR, (event) => {
  const detail = (event as CustomEvent<{ code: string; to: string; phase: string }>).detail;
  pushLog(`Ошибка ${detail.code} (${detail.phase}) → ${detail.to}`, 'error');
  queueMicrotask(updateChrome);
});

document.addEventListener('demo:pageview', (event) => {
  const { path } = (event as CustomEvent<{ path: string }>).detail;
  pushLog(`Открыта ${path}`, 'nav');
  queueMicrotask(updateChrome);
});

document.addEventListener('demo:loader', (event) => {
  const { type } = (event as CustomEvent<{ type: string }>).detail;
  pushLog(`Loader: ${type}`, 'system');
});

document.addEventListener('demo:load-hook', (event) => {
  const { hook } = (event as CustomEvent<{ hook: string }>).detail;
  pushLog(`Load hook «${hook}» выполнен`, 'system');
});

document.addEventListener('click', (event) => {
  const target = event.target as Element;

  if (target.closest('#demo-story-back')) {
    goHome();
    return;
  }
  if (target.closest('#demo-story-code')) {
    setDevPanelOpen(true);
    return;
  }
  if (target.closest('#demo-dev-close')) {
    setDevPanelOpen(false);
    return;
  }
  if (target.closest('#demo-dev-toggle')) {
    setDevPanelOpen(!!devPanel?.hasAttribute('hidden'));
    return;
  }
  if (target.closest('#demo-url-copy')) {
    void copyCurrentUrl();
    return;
  }
  if (target.closest('#demo-tour-start')) {
    tour?.start();
    return;
  }

  const policyButton = target.closest<HTMLButtonElement>('[data-transition-policy]');
  if (policyButton?.dataset.transitionPolicy) {
    restartRouter(policyButton.dataset.transitionPolicy);
    return;
  }

  if (target.closest('[data-demo-auth-toggle]')) {
    setDemoAuth(!demoAuthEnabled);
    syncAuthUi();
    pushLog(demoAuthEnabled ? 'Вошли' : 'Вышли', 'auth');
    return;
  }

  if (target.closest('[data-demo-sign-in]')) {
    setDemoAuth(true);
    syncAuthUi();
    pushLog('Вход через /login', 'auth');
    router?.navigate('/hooks/protected', { syncHistory: true });
    return;
  }

  if (target.closest('[data-router-link]')) {
    queueMicrotask(updateChrome);
  }
});

syncTransitionPolicyUi(router?.getAttribute('transition-order') ?? 'parallel');
syncAuthUi();
updateChrome();

window.addEventListener('popstate', () => {
  pushLog(`popstate → ${location.pathname}`, 'nav');
  updateChrome();
});

if (location.pathname === '/' && !isTourDone()) {
  window.setTimeout(() => tour?.start(), 400);
}

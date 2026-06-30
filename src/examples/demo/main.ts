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
import { fadeTransitionHook, slideTransitionHook } from './hooks/view-transition.hook';
import { demoAuthEnabled, setDemoAuth } from './demo-state';
import { resolveScenario } from './scenarios';
import { storyForPath } from './stories';

defaultLoaderRegistry.register(CUSTOM_LOADER_TYPE, customLoader);
defaultLoaderRegistry.register(SLOW_LOADER_TYPE, slowLoader);

AuraRouter.configure({
  dataCache: { max: 50, gcTime: Infinity, gcSweepInterval: false },
  viewCache: { max: 10, gcTime: Infinity, gcSweepInterval: false },
});

AuraRouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AuraRouter.use(analyticsHook);
AuraRouter.use(fadeTransitionHook);
AuraRouter.use(slideTransitionHook);
AuraRouter.install();

type LogKind = 'nav' | 'auth' | 'error' | 'system';
type LogEntry = { time: string; message: string; kind: LogKind };

const router = document.querySelector<AuraRouter>(AuraRouter.is);
const pathLabel = document.getElementById('demo-current-path');
const urlBadge = document.getElementById('demo-url-badge');
const routeRecipe = document.getElementById('demo-route-recipe');
const logList = document.getElementById('demo-log-list');
const authToggle = document.getElementById('demo-auth-toggle') as HTMLButtonElement | null;
const authStatus = document.getElementById('demo-auth-status');
const policyButtons = document.querySelectorAll<HTMLButtonElement>('[data-transition-policy]');
const topbarTagline = document.getElementById('topbar-tagline');

const storyBar = document.getElementById('demo-story-bar');
const storyTitle = document.getElementById('demo-story-title');
const storyTry = document.getElementById('demo-story-try');
const storyWatch = document.getElementById('demo-story-watch');
const devPanel = document.getElementById('demo-dev-panel');

const MAX_LOG = 8;
const logEntries: LogEntry[] = [];
let lastPath = location.pathname;
let urlPulseTimer = 0;

function setPageMode(path: string): void {
  const story = storyForPath(path);
  const isHome = path === '/';

  document.body.classList.toggle('mode-home', isHome);
  document.body.classList.toggle('mode-story', !isHome);
  document.body.classList.toggle('show-auth', !!story?.showAuth);

  if (topbarTagline) {
    topbarTagline.textContent = isHome ? 'Страницы без перезагрузки' : (story?.title ?? 'Демо');
  }

  if (storyBar) {
    if (isHome) storyBar.setAttribute('hidden', '');
    else storyBar.removeAttribute('hidden');
  }

  if (story && storyTitle) storyTitle.textContent = `${story.icon} ${story.title}`;
  if (story && storyTry) storyTry.textContent = story.try;
  if (story && storyWatch) storyWatch.textContent = story.watch;
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

function updateChrome(): void {
  const path = location.pathname;

  if (pathLabel) {
    pathLabel.textContent = path;
    pathLabel.title = path;
  }
  if (path !== lastPath) {
    lastPath = path;
    if (path !== '/') pulseUrlBar();
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
  devPanel?.setAttribute('hidden', '');
  router?.navigate('/', { syncHistory: true });
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
  pushLog(`Анимация: ${nextPolicy}`, 'system');
}

router?.addEventListener(AURA_ROUTER_NOT_FOUND, (event) => {
  const { url, source } = (event as CustomEvent<{ url: string; source: string }>).detail;
  pushLog(`404 (${source}): ${url}`, 'error');
  queueMicrotask(updateChrome);
});

router?.addEventListener(AURA_ROUTER_NAVIGATION_ERROR, (event) => {
  const { code, to } = (event as CustomEvent<{ code: string; to: string }>).detail;
  pushLog(`Ошибка ${code} на ${to}`, 'error');
  queueMicrotask(updateChrome);
});

document.addEventListener('click', (event) => {
  const target = event.target as Element;

  if (target.closest('#demo-story-back')) {
    goHome();
    return;
  }
  if (target.closest('#demo-story-code')) {
    devPanel?.removeAttribute('hidden');
    return;
  }
  if (target.closest('#demo-dev-close')) {
    devPanel?.setAttribute('hidden', '');
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

const nativeLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.startsWith('[Analytics]')) {
    const path = first.replace('[Analytics] pageview: ', '');
    pushLog(`Открыта ${path}`, 'nav');
    queueMicrotask(updateChrome);
  }
  nativeLog(...args);
};

syncTransitionPolicyUi(router?.getAttribute('data-transition') ?? 'parallel');
syncAuthUi();
updateChrome();

window.addEventListener('popstate', updateChrome);

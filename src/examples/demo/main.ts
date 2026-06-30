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

const router = document.querySelector<AuraRouter>(AuraRouter.is);
const pathLabel = document.getElementById('demo-current-path');
const scenarioTitle = document.getElementById('demo-scenario-title');
const scenarioHint = document.getElementById('demo-scenario-hint');
const scenarioGroup = document.getElementById('demo-scenario-group');
const logList = document.getElementById('demo-log-list');
const authToggle = document.getElementById('demo-auth-toggle') as HTMLButtonElement | null;
const authStatus = document.getElementById('demo-auth-status');
const policyButtons = document.querySelectorAll<HTMLButtonElement>('[data-transition-policy]');

const MAX_LOG = 6;
const logEntries: string[] = [];

function pushLog(message: string): void {
  const time = new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  logEntries.unshift(`${time} — ${message}`);
  if (logEntries.length > MAX_LOG) logEntries.length = MAX_LOG;
  if (logList) {
    logList.innerHTML = logEntries.map((entry) => `<li>${entry}</li>`).join('');
  }
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

function updateChrome(): void {
  const path = location.pathname;
  const scenario = resolveScenario(path);

  if (pathLabel) pathLabel.textContent = path;
  if (scenarioTitle) scenarioTitle.textContent = scenario.title;
  if (scenarioHint) scenarioHint.textContent = scenario.hint;
  if (scenarioGroup) scenarioGroup.textContent = scenario.group;

  document.querySelectorAll<HTMLAnchorElement>('[data-router-link]').forEach((link) => {
    const linkPath = link.pathname;
    const active =
      linkPath === path ||
      (linkPath !== '/' && path.startsWith(linkPath + '/')) ||
      (linkPath.startsWith('/routing/user/') && path.startsWith('/routing/user/'));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  document.querySelectorAll<HTMLAnchorElement>('[data-nav-group]').forEach((link) => {
    const group = link.dataset.navGroup;
    if (group && group === scenario.group) link.classList.add('is-group-active');
    else link.classList.remove('is-group-active');
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
  pushLog(`Порядок анимации: ${nextPolicy}`);
}

router?.addEventListener(AURA_ROUTER_NOT_FOUND, (event) => {
  const { url, source } = (event as CustomEvent<{ url: string; source: string }>).detail;
  pushLog(`404 (${source}): ${url}`);
  queueMicrotask(updateChrome);
});

router?.addEventListener(AURA_ROUTER_NAVIGATION_ERROR, (event) => {
  const { code, to } = (event as CustomEvent<{ code: string; to: string }>).detail;
  pushLog(`Ошибка ${code} на ${to}`);
  queueMicrotask(updateChrome);
});

document.addEventListener('click', (event) => {
  const target = event.target as Element;

  const policyButton = target.closest<HTMLButtonElement>('[data-transition-policy]');
  if (policyButton?.dataset.transitionPolicy) {
    restartRouter(policyButton.dataset.transitionPolicy);
    return;
  }

  if (target.closest('[data-demo-auth-toggle]')) {
    setDemoAuth(!demoAuthEnabled);
    syncAuthUi();
    pushLog(demoAuthEnabled ? 'Auth: вошли' : 'Auth: вышли');
    return;
  }

  if (target.closest('[data-demo-sign-in]')) {
    setDemoAuth(true);
    syncAuthUi();
    pushLog('Auth: вход через /login');
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
    pushLog(`Открыта ${path}`);
    queueMicrotask(updateChrome);
  }
  nativeLog(...args);
};

syncTransitionPolicyUi(router?.getAttribute('data-transition') ?? 'parallel');
syncAuthUi();
updateChrome();
pushLog('Демо готово');
window.addEventListener('popstate', updateChrome);

import { AuraRouter, defineRouteHook } from '@auraui/router';
import {
  BODIES,
  ERAS,
  EVENTS,
  KEYS,
  MISSIONS,
  MODULES,
  NOTES,
  SCALES,
  TOUR,
} from './catalog.js';

const pathOf = () => window.location.pathname.replace(/\/$/, '') || '/';
const router = () => document.querySelector('aura-router');
const $ = (sel, root = document) => root.querySelector(sel);

function crumb(label, href) {
  return href
    ? `<a href="${href}" aura-router-link>${label}</a>`
    : `<span aria-current="page">${label}</span>`;
}

function renderCrumbs(parts) {
  const el = $('[data-crumbs]');
  if (!el) return;
  el.innerHTML = parts
    .map(([label, href]) => crumb(label, href))
    .join('<span class="crumb-sep" aria-hidden="true">/</span>');
}

function setText(sel, text) {
  const el = $(sel);
  if (el && el.textContent !== text) el.textContent = text;
}

function setHref(sel, href) {
  const el = $(sel);
  if (!el) return;
  if (el.getAttribute('href') !== href) el.setAttribute('href', href);
  el.toggleAttribute('aura-router-link', true);
}

function markActive(rootSel, attr, value) {
  const root = $(rootSel);
  if (!root) return;
  for (const link of root.querySelectorAll(`[${attr}]`)) {
    link.classList.toggle('active', link.getAttribute(attr) === value);
  }
}

/* —— Route hooks —— */

const callsignGuard = defineRouteHook('callsign', async () => {
  if (sessionStorage.getItem(KEYS.callsign)) return;
  sessionStorage.setItem(KEYS.bounce, '1');
  return { type: 'redirect', url: '/briefing', replace: true };
});

const eraChrome = defineRouteHook('era-chrome', async (ctx) => {
  const { eraId, eventId } = ctx.to.params || {};
  if (!eraId) return;

  const name = ERAS[eraId] || eraId;
  setText('[data-layout-title]', name);
  setHref('[data-nav="overview"]', `/chronicle/${eraId}`);

  const parts = [
    ['Атлас', '/'],
    ['Хроника', '/chronicle'],
  ];
  if (eventId) {
    parts.push([name, `/chronicle/${eraId}`]);
    parts.push([EVENTS[eventId] || eventId]);
  } else {
    parts.push([name]);
  }
  renderCrumbs(parts);
});

const systemChrome = defineRouteHook('system-chrome', async (ctx) => {
  const { bodyId, id: missionId } = ctx.to.params || {};
  if (!bodyId) return;

  const name = BODIES[bodyId] || bodyId;
  setText('[data-layout-title]', name);
  setHref('[data-nav="overview"]', `/system/${bodyId}`);

  const parts = [
    ['Атлас', '/'],
    ['Система', '/system'],
  ];
  if (missionId) {
    parts.push([name, `/system/${bodyId}`]);
    parts.push([MISSIONS[missionId] || missionId]);
  } else {
    parts.push([name]);
  }
  renderCrumbs(parts);
});

const mirChrome = defineRouteHook('mir-chrome', async (ctx) => {
  const moduleId = ctx.to.params?.moduleId;
  const path = ctx.to.pathname || '';

  setText(
    '[data-layout-title]',
    moduleId ? MODULES[moduleId] || moduleId : 'Станция «Мир»',
  );

  const parts = [
    ['Атлас', '/'],
    ['Станция «Мир»', '/mir'],
  ];
  if (moduleId) parts.push([MODULES[moduleId] || moduleId]);
  renderCrumbs(parts);

  const onOverview = path === '/mir' || path === '/mir/';
  markActive('[data-mir-map]', 'data-module', onOverview ? '' : moduleId || '');
});

const deepChrome = defineRouteHook('deep-chrome', async (ctx) => {
  const { scaleId } = ctx.to.params || {};
  const path = ctx.to.pathname || '';
  const isHorizon = path === '/deep/horizon';
  const isHub = path === '/deep' || path === '/deep/';

  const title = isHorizon
    ? 'За горизонтом'
    : isHub
      ? 'Масштабы'
      : SCALES[scaleId] || scaleId || 'Масштабы';
  setText('[data-layout-title]', title);

  const parts = [
    ['Атлас', '/'],
    ['Масштабы', isHub ? undefined : '/deep'],
  ];
  if (isHorizon) parts.push(['Горизонт']);
  else if (!isHub && scaleId) parts.push([SCALES[scaleId] || scaleId]);
  renderCrumbs(parts.filter((p) => p[0]));

  markActive(
    '[data-scale-rail]',
    'data-scale',
    isHorizon ? 'horizon' : isHub ? '' : scaleId || '',
  );
});

AuraRouter.use(callsignGuard);
AuraRouter.use(eraChrome);
AuraRouter.use(systemChrome);
AuraRouter.use(mirChrome);
AuraRouter.use(deepChrome);
AuraRouter.install();

/* —— Shell chrome (tour + notes + guard banner) —— */

function syncTour() {
  const rail = $('[data-tour-rail]');
  const steps = $('[data-tour-steps]');
  const next = $('[data-tour-next]');
  if (!rail || !steps || !next) return;

  const path = pathOf();
  const idx = TOUR.findIndex((s) => s.match(path));
  if (idx < 0) {
    rail.hidden = true;
    return;
  }

  rail.hidden = false;
  steps.innerHTML = TOUR.map((s, i) => {
    const state = i < idx ? 'is-done' : i === idx ? 'is-current' : 'is-todo';
    return `<li class="${state}"><a href="${s.href}" aura-router-link><span>${i + 1}</span>${s.label}</a></li>`;
  }).join('');

  next.textContent = TOUR[idx].nextLabel;
  next.setAttribute('href', TOUR[idx].nextHref);
}

function syncNote() {
  const note = $('[data-dev-note]');
  if (!note) return;
  const path = pathOf();
  const tour = TOUR.find((s) => s.match(path));
  const found = NOTES.find((n) => n.test(path));
  note.textContent =
    tour?.aura ||
    found?.text ||
    'Смотрите nested layouts, extract, cache и guard на других шагах маршрута.';
}

function syncGuardBanner() {
  if (!sessionStorage.getItem(KEYS.bounce)) {
    const host = $('[data-guard-banner]');
    if (host) host.hidden = true;
    return;
  }
  const host = $('[data-guard-banner]');
  if (!host) return;
  host.hidden = false;
  sessionStorage.removeItem(KEYS.bounce);
}

function syncChrome() {
  syncTour();
  syncNote();
  syncGuardBanner();
}

function bindChrome() {
  const el = router();
  if (!el || el.dataset.chromeBound) return;
  el.dataset.chromeBound = '1';
  for (const ev of ['navigation-complete', 'navigation', 'load-end']) {
    el.addEventListener(ev, syncChrome);
  }
  syncChrome();
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-briefing-form]');
  if (!form) return;
  event.preventDefault();
  const callsign = String(new FormData(form).get('callsign') || '').trim();
  if (!callsign) return;
  sessionStorage.setItem(KEYS.callsign, callsign);
  sessionStorage.removeItem(KEYS.bounce);
  router()?.navigate('/deep/horizon');
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-callsign-reset]')) return;
  sessionStorage.removeItem(KEYS.callsign);
  router()?.navigate('/');
});

bindChrome();
queueMicrotask(bindChrome);

import { AuraRouter, defineRouteHook } from '@auraui/router';

const JOURNEY_KEY = 'diskora-traveler';
const GUARD_BOUNCE_KEY = 'diskora-guard-bounce';

const REGION_NAMES = {
  whisperwood: 'Шепчущий Лес',
  mirrorsea: 'Зеркальное Море',
  icewall: 'У Ледяной Стены',
  hearthlands: 'Срединные Земли',
  sunsteppe: 'Солнечная Степь',
};

const TRAIL_NAMES = {
  'echo-glade': 'Поляна Эха',
  'lantern-isles': 'Острова Фонарей',
  'north-gate-path': 'К Северному Гулу',
};

const SIGHT_NAMES = {
  'nine-toes': 'След с девятью пальцами',
  'owl-perch': 'Жердочка библиотекаря',
  'fox-wedding': 'Лисья свадьба',
  'root-window': 'Окно между корнями',
  'pier-mist': 'Причал в тумане',
  'horse-ferry': 'Переправа морского коня',
  'whale-song': 'Песня сказителя',
  'gate-flags': 'Флаги заставы',
  'bear-watch': 'Медведь-страж',
  'ice-crack': 'Трещина во льду',
};

const TOUR = [
  {
    id: 'forest',
    label: 'Лес',
    href: '/regions/whisperwood',
    match: (path) => path === '/regions/whisperwood',
    nextLabel: 'К тропе Поляны Эха',
    nextHref: '/regions/whisperwood/trails/echo-glade',
    aura: 'Nested layout: шапка региона остаётся на месте при смене вложенных страниц.',
  },
  {
    id: 'trail',
    label: 'Тропа',
    href: '/regions/whisperwood/trails/echo-glade',
    match: (path) => path === '/regions/whisperwood/trails/echo-glade',
    nextLabel: 'К жердочке совы',
    nextHref: '/regions/whisperwood/trails/echo-glade/sights/owl-perch',
    aura: 'Глубокий nested path: region → trail → (дальше sight).',
  },
  {
    id: 'sight',
    label: 'Точка',
    href: '/regions/whisperwood/trails/echo-glade/sights/owl-perch',
    match: (path) =>
      path === '/regions/whisperwood/trails/echo-glade/sights/owl-perch',
    nextLabel: 'Карточка зверя',
    nextHref: '/bestiary/owl-librarian',
    aura: 'Самый глубокий уровень вложенности в демо.',
  },
  {
    id: 'beast',
    label: 'Зверь',
    href: '/bestiary/owl-librarian',
    match: (path) => path === '/bestiary/owl-librarian',
    nextLabel: 'К Ледяной Стене',
    nextHref: '/wall',
    aura: 'Отдельная ветка /bestiary/:id с extract и задержкой сервера.',
  },
  {
    id: 'wall',
    label: 'Стена',
    href: '/wall',
    match: (path) => path === '/wall',
    nextLabel: 'Вписать имя в книгу',
    nextHref: '/start-journey',
    aura: 'Плоский раздел /wall — не путать с регионом /regions/icewall (тропы у обода).',
  },
  {
    id: 'book',
    label: 'Книга',
    href: '/start-journey',
    match: (path) => path === '/start-journey',
    nextLabel: 'Заглянуть за Стену',
    nextHref: '/wall/beyond',
    aura: 'Запись в sessionStorage открывает путь с guard="journey".',
  },
  {
    id: 'beyond',
    label: 'За край',
    href: '/wall/beyond',
    match: (path) => path === '/wall/beyond',
    nextLabel: 'Вернуться к карте',
    nextHref: '/',
    aura: 'Guard: без имени странника редирект на Книгу Странника.',
  },
];

const DEV_NOTES = [
  {
    test: (path) => path === '/',
    text: 'Старт: template::home-page внутри shell. Prefetch и cache включены на роутере.',
  },
  {
    test: (path) => path === '/about',
    text: 'Локальный template::about-page — без сетевого запроса.',
  },
  {
    test: (path) => path.startsWith('/bestiary'),
    text: 'MPA-фрагмент: view + extract=".main". Книга зверей с cache.',
  },
  {
    test: (path) => /\/regions\/[^/]+\/trails\/[^/]+\/sights\//.test(path),
    text: 'Вложенный sight внутри region layout (ready/update = region-chrome).',
  },
  {
    test: (path) => /\/regions\/[^/]+\/trails\//.test(path),
    text: 'Вложенная тропа: родительский layout не перемонтируется.',
  },
  {
    test: (path) => /\/regions\/[^/]+\/journal$/.test(path),
    text: 'Отдельный loading-template="loading-journal" и задержка на сервере.',
  },
  {
    test: (path) => path.startsWith('/regions/'),
    text: 'Region layout + breadcrumbs через hook region-chrome.',
  },
  {
    test: (path) => path === '/wall/beyond',
    text: 'guard="journey" — без sessionStorage редирект на /start-journey.',
  },
  {
    test: (path) => path.startsWith('/wall'),
    text: 'Раздел застав /wall. Регион троп у обода — /regions/icewall.',
  },
  {
    test: (path) => path === '/start-journey',
    text: 'Форма пишет имя в sessionStorage; это ключ для guard.',
  },
  {
    test: (path) => path === '/seasons',
    text: 'Доп. страница из «О мире» — не в главном меню, чтобы не дробить поток.',
  },
];

const journeyGuard = defineRouteHook('journey', async () => {
  if (sessionStorage.getItem(JOURNEY_KEY)) return;
  sessionStorage.setItem(GUARD_BOUNCE_KEY, '1');
  return { type: 'redirect', url: '/start-journey', replace: true };
});

function crumb(label, href) {
  if (!href) {
    return `<span aria-current="page">${label}</span>`;
  }
  return `<a href="${href}" aura-router-link>${label}</a>`;
}

function syncRegionChrome(ctx) {
  const regionId = ctx.to.params?.regionId;
  if (!regionId) return;

  const name = REGION_NAMES[regionId] || regionId;
  const title = document.querySelector('.region-name');
  if (title && title.textContent !== name) {
    title.textContent = name;
  }

  const overview = document.querySelector('[data-nav="overview"]');
  const journal = document.querySelector('[data-nav="journal"]');
  const overviewHref = `/regions/${regionId}`;
  const journalHref = `/regions/${regionId}/journal`;

  if (overview) {
    if (overview.getAttribute('href') !== overviewHref) {
      overview.setAttribute('href', overviewHref);
    }
    if (!overview.hasAttribute('aura-router-link')) {
      overview.setAttribute('aura-router-link', '');
    }
  }

  if (journal) {
    if (journal.getAttribute('href') !== journalHref) {
      journal.setAttribute('href', journalHref);
    }
    if (!journal.hasAttribute('aura-router-link')) {
      journal.setAttribute('aura-router-link', '');
    }
  }

  const crumbs = document.querySelector('[data-region-crumbs]');
  if (!crumbs) return;

  const { trailId, id: sightId } = ctx.to.params || {};
  const path = ctx.to.pathname || '';
  const parts = [crumb('Диск', '/')];

  if (path.endsWith('/journal')) {
    parts.push(crumb(name, overviewHref));
    parts.push(crumb('Дневник'));
  } else if (sightId) {
    parts.push(crumb(name, overviewHref));
    parts.push(
      crumb(
        TRAIL_NAMES[trailId] || trailId,
        `/regions/${regionId}/trails/${trailId}`,
      ),
    );
    parts.push(crumb(SIGHT_NAMES[sightId] || sightId));
  } else if (trailId) {
    parts.push(crumb(name, overviewHref));
    parts.push(crumb(TRAIL_NAMES[trailId] || trailId));
  } else {
    parts.push(crumb(name));
  }

  crumbs.innerHTML = parts.join(
    '<span class="crumb-sep" aria-hidden="true">/</span>',
  );
}

const regionChrome = defineRouteHook('region-chrome', async (ctx) => {
  syncRegionChrome(ctx);
});

AuraRouter.use(journeyGuard);
AuraRouter.use(regionChrome);
AuraRouter.install();

function router() {
  return document.querySelector('aura-router');
}

function currentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/';
}

function tourIndexFor(path) {
  return TOUR.findIndex((step) => step.match(path));
}

function syncTourRail() {
  const rail = document.querySelector('[data-tour-rail]');
  const stepsEl = document.querySelector('[data-tour-steps]');
  const nextEl = document.querySelector('[data-tour-next]');
  if (!rail || !stepsEl || !nextEl) return;

  const path = currentPath();
  const idx = tourIndexFor(path);

  if (idx < 0) {
    rail.hidden = true;
    return;
  }

  rail.hidden = false;
  stepsEl.innerHTML = TOUR.map((step, i) => {
    const state = i < idx ? 'is-done' : i === idx ? 'is-current' : 'is-todo';
    return `<li class="${state}"><a href="${step.href}" aura-router-link><span>${i + 1}</span>${step.label}</a></li>`;
  }).join('');

  const step = TOUR[idx];
  nextEl.textContent = step.nextLabel;
  nextEl.setAttribute('href', step.nextHref);
}

function syncDevNote() {
  const note = document.querySelector('[data-dev-note]');
  if (!note) return;
  const path = currentPath();
  const found = DEV_NOTES.find((item) => item.test(path));
  const tourStep = TOUR.find((step) => step.match(path));
  note.textContent =
    tourStep?.aura ||
    found?.text ||
    'Обычная страница атласа — смотрите extract, nested routes и guard в других шагах маршрута.';
}

function syncGuardBanner() {
  const bounced = sessionStorage.getItem(GUARD_BOUNCE_KEY);
  const host = document.querySelector('[data-guard-banner]');
  if (!bounced) {
    if (host) host.hidden = true;
    return;
  }
  // Fragment may arrive after navigation-complete — keep the flag until shown.
  if (!host) return;
  host.hidden = false;
  sessionStorage.removeItem(GUARD_BOUNCE_KEY);
}

function syncBeyondGreeting() {
  const el = document.querySelector('[data-beyond-greeting]');
  if (!el) return;
  const name = sessionStorage.getItem(JOURNEY_KEY);
  if (!name) return;
  el.textContent =
    `${name}, карты кончаются. Остаётся гул, северное сияние, поставленное вертикально, ` +
    `и ощущение, что стол мира всё же имеет ножку — только её не рисуют.`;
}

function syncChrome() {
  syncTourRail();
  syncDevNote();
  syncGuardBanner();
  syncBeyondGreeting();
}

function bindRouterChrome() {
  const el = router();
  if (!el || el.dataset.chromeBound) return;
  el.dataset.chromeBound = '1';
  el.addEventListener('navigation-complete', syncChrome);
  el.addEventListener('navigation', syncChrome);
  el.addEventListener('load-end', syncChrome);
  syncChrome();
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-journey-form]');
  if (!form) return;
  event.preventDefault();
  const name = String(new FormData(form).get('name') || '').trim();
  if (!name) return;
  sessionStorage.setItem(JOURNEY_KEY, name);
  sessionStorage.removeItem(GUARD_BOUNCE_KEY);
  router()?.navigate('/wall/beyond');
});

document.addEventListener('click', (event) => {
  const reset = event.target.closest('[data-journey-reset]');
  if (!reset) return;
  sessionStorage.removeItem(JOURNEY_KEY);
  router()?.navigate('/');
});

bindRouterChrome();
queueMicrotask(bindRouterChrome);
setTimeout(bindRouterChrome, 50);

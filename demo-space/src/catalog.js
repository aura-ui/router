/** Labels + tour + router notes — one place for chrome text. */

export const ERAS = {
  dreams: 'Мечта',
  dawn: 'Рассвет',
  flight: 'Полёт',
  orbit: 'Орбита',
};

export const EVENTS = {
  tsiolkovsky: 'Циолковский',
  sputnik: 'Спутник-1',
  gagarin: 'Гагарин',
  tereshkova: 'Терешкова',
  leonov: 'Леонов',
  salyut: 'Салют',
  mir: 'Станция «Мир»',
};

export const BODIES = {
  earth: 'Земля',
  moon: 'Луна',
  venus: 'Венера',
  mars: 'Марс',
};

export const MISSIONS = {
  'vostok-1': 'Восток-1',
  'luna-9': 'Луна-9',
  'venera-7': 'Венера-7',
  'mars-3': 'Марс-3',
};

export const MODULES = {
  base: 'Базовый блок',
  kvant: 'Квант',
  'kvant-2': 'Квант-2',
  kristall: 'Кристалл',
  spektr: 'Спектр',
  priroda: 'Природа',
};

export const SCALES = {
  solar: 'Солнечная система',
  oort: 'Облако Оорта',
  'milky-way': 'Млечный Путь',
  'local-group': 'Местная группа',
  observable: 'Наблюдаемая Вселенная',
};

export const CRAFT = {
  vostok: 'Восток',
  soyuz: 'Союз',
  lunokhod: 'Луноход',
  buran: 'Буран',
};

export const KEYS = {
  callsign: 'orbit-callsign',
  bounce: 'orbit-guard-bounce',
};

/** Guided path that also demos Aura features. */
export const TOUR = [
  {
    id: 'era',
    label: 'Эпоха',
    href: '/chronicle/flight',
    match: (p) => p === '/chronicle/flight',
    nextLabel: 'К полёту Гагарина',
    nextHref: '/chronicle/flight/gagarin',
    aura: 'Nested layout: шапка эпохи остаётся при смене события.',
  },
  {
    id: 'event',
    label: 'Событие',
    href: '/chronicle/flight/gagarin',
    match: (p) => p === '/chronicle/flight/gagarin',
    nextLabel: 'К Земле в системе',
    nextHref: '/system/earth',
    aura: 'Глубже в nested: chronicle → era → event.',
  },
  {
    id: 'planet',
    label: 'Планета',
    href: '/system/earth',
    match: (p) => p === '/system/earth',
    nextLabel: 'Миссия Восток-1',
    nextHref: '/system/earth/missions/vostok-1',
    aura: 'Другая nested-ветка: system → body (+ layout).',
  },
  {
    id: 'mission',
    label: 'Миссия',
    href: '/system/earth/missions/vostok-1',
    match: (p) => p === '/system/earth/missions/vostok-1',
    aura: 'Вложенная миссия + extract с сервера (задержка).',
    nextLabel: 'На станцию «Мир»',
    nextHref: '/mir/modules/base',
  },
  {
    id: 'mir',
    label: 'Мир',
    href: '/mir/modules/base',
    match: (p) => p === '/mir/modules/base',
    nextLabel: 'К Млечному Пути',
    nextHref: '/deep/milky-way',
    aura: 'Layout станции + hook подсвечивает активный модуль.',
  },
  {
    id: 'deep',
    label: 'Глубина',
    href: '/deep/milky-way',
    match: (p) => p === '/deep/milky-way',
    nextLabel: 'Брифинг позывного',
    nextHref: '/briefing',
    aura: 'Лестница масштабов /deep/:scaleId.',
  },
  {
    id: 'brief',
    label: 'Брифинг',
    href: '/briefing',
    match: (p) => p === '/briefing',
    nextLabel: 'За горизонт',
    nextHref: '/deep/horizon',
    aura: 'sessionStorage открывает маршрут с guard.',
  },
  {
    id: 'horizon',
    label: 'Горизонт',
    href: '/deep/horizon',
    match: (p) => p === '/deep/horizon',
    nextLabel: 'В ЦУП',
    nextHref: '/',
    aura: 'guard="callsign" — без позывного редирект на /briefing.',
  },
];

export const NOTES = [
  {
    test: (p) => p === '/',
    text: 'Старт: template::home внутри shell. На роутере — cache и prefetch.',
  },
  {
    test: (p) => p === '/about',
    text: 'MPA-страница /about с extract=".main".',
  },
  {
    test: (p) => p.startsWith('/fleet'),
    text: 'Каталог /fleet — плоская ветка с cache на списке.',
  },
  {
    test: (p) => /\/chronicle\/[^/]+\/[^/]+/.test(p),
    text: 'Событие внутри layout эпохи (ready/update = era-chrome).',
  },
  {
    test: (p) => p.startsWith('/chronicle/'),
    text: 'Хроника: nested layout + breadcrumbs из params.',
  },
  {
    test: (p) => /\/system\/[^/]+\/missions\//.test(p),
    text: 'Миссия внутри layout планеты (system-chrome).',
  },
  {
    test: (p) => p.startsWith('/system/'),
    text: 'Солнечная система: layout тела + список миссий.',
  },
  {
    test: (p) => p.startsWith('/mir'),
    text: '«Мир»: schema layout + loading-template для модулей.',
  },
  {
    test: (p) => p === '/deep/horizon',
    text: 'guard="callsign" — без sessionStorage редирект на брифинг.',
  },
  {
    test: (p) => p.startsWith('/deep/'),
    text: 'Далёкий космос: уровни масштаба /deep/:scaleId.',
  },
  {
    test: (p) => p === '/briefing',
    text: 'Форма пишет позывной в sessionStorage — ключ для guard.',
  },
];

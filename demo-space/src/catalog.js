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

/** Starts beyond the planet map — no overlap with /system. */
export const SCALES = {
  heliosphere: 'Гелиосфера',
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

/** Short guided path. Briefing is unlock UX, not a tour stop. */
export const TOUR = [
  {
    id: 'chronicle',
    label: 'Хроника',
    href: '/chronicle',
    match: (p) => p === '/chronicle',
    nextLabel: 'К полёту Гагарина',
    nextHref: '/chronicle/flight/gagarin',
    aura: 'Хаб раздела: обзор всей ленты до входа в nested-эпохи.',
  },
  {
    id: 'event',
    label: 'Событие',
    href: '/chronicle/flight/gagarin',
    match: (p) => p === '/chronicle/flight/gagarin',
    nextLabel: 'Миссия Восток-1',
    nextHref: '/system/earth/missions/vostok-1',
    aura: 'Nested: эпоха остаётся, меняется событие (era-chrome).',
  },
  {
    id: 'mission',
    label: 'Миссия',
    href: '/system/earth/missions/vostok-1',
    match: (p) => p === '/system/earth/missions/vostok-1',
    nextLabel: 'На станцию «Мир»',
    nextHref: '/mir/modules/base',
    aura: 'Вложенная миссия в layout планеты + extract с сервера.',
  },
  {
    id: 'mir',
    label: '«Мир»',
    href: '/mir/modules/base',
    match: (p) => p === '/mir/modules/base',
    nextLabel: 'К масштабам',
    nextHref: '/deep/heliosphere',
    aura: 'Layout станции + hook подсвечивает активный модуль.',
  },
  {
    id: 'deep',
    label: 'Масштаб',
    href: '/deep/heliosphere',
    match: (p) => p === '/deep/heliosphere',
    nextLabel: 'За горизонт',
    nextHref: '/deep/horizon',
    aura: 'Лестница масштабов; старт выше карты планет.',
  },
  {
    id: 'horizon',
    label: 'Горизонт',
    href: '/deep/horizon',
    match: (p) => p === '/deep/horizon',
    nextLabel: 'В атлас',
    nextHref: '/',
    aura: 'guard="callsign" — без позывного редирект на /briefing.',
  },
];

export const NOTES = [
  {
    test: (p) => p === '/',
    text: 'Старт: template::home. Меню ведёт на хабы разделов, не в середину.',
  },
  {
    test: (p) => p === '/about',
    text: 'MPA-страница /about с extract=".main".',
  },
  {
    test: (p) => p === '/chronicle',
    text: 'Хаб хроники: вся лента на одном экране, дальше — nested эпохи.',
  },
  {
    test: (p) => p === '/system',
    text: 'Хаб системы: выбор планеты здесь, не на странице Земли.',
  },
  {
    test: (p) => p === '/deep',
    text: 'Хаб масштабов внутри deep-layout (path=".").',
  },
  {
    test: (p) => p.startsWith('/fleet'),
    text: 'Справочник /fleet — вне главного меню, cache на списке.',
  },
  {
    test: (p) => /\/chronicle\/[^/]+\/[^/]+/.test(p),
    text: 'Событие внутри layout эпохи (ready/update = era-chrome).',
  },
  {
    test: (p) => p.startsWith('/chronicle/'),
    text: 'Хроника: nested layout + breadcrumbs на хаб /chronicle.',
  },
  {
    test: (p) => /\/system\/[^/]+\/missions\//.test(p),
    text: 'Миссия внутри layout планеты (system-chrome).',
  },
  {
    test: (p) => p.startsWith('/system/'),
    text: 'Планета: layout + список миссий; хаб выбора — /system.',
  },
  {
    test: (p) => p.startsWith('/mir'),
    text: 'Станция «Мир»: schema layout + loading-template для модулей.',
  },
  {
    test: (p) => p === '/deep/horizon',
    text: 'guard="callsign" — без sessionStorage редирект на брифинг.',
  },
  {
    test: (p) => p.startsWith('/deep/'),
    text: 'Масштабы /deep/:scaleId — от гелиосферы вверх, без дубля планет.',
  },
  {
    test: (p) => p === '/briefing',
    text: 'Допуск: форма → sessionStorage. Не шаг тура, а unlock для guard.',
  },
];

/**
 * Конфигурация demo-сценариев.
 *
 * Новый сценарий:
 * 1. Добавьте запись в DEMO_SCENARIOS (root + опционально layout).
 * 2. В shell index.html: class="demo-page demo-site" и data-demo-scenario="your-id".
 * 3. View-partials: class="demo-site-view demo-layout-view" и data-demo-view="features/…/view.html".
 * 4. vite.config.ts — fallback prefix для root path.
 * 5. nextStep — ссылки в footer «Далее».
 * 6. DEMO_VIEW_META — facts для data-demo-view.
 */

export interface DemoNavLink {
  path: string;
  label: string;
}

export interface DemoNextLink {
  href: string;
  label: string;
}

export interface DemoLayoutConfig {
  usersChromeLabel: string;
  usersNav: DemoNavLink[];
  slotLabelL1: string;
  userChromeLabel?: string;
  userNav?: DemoNavLink[];
  slotLabelL2?: string;
}

export interface DemoScenario {
  root: string;
  layout?: DemoLayoutConfig;
  nextStep?: DemoNextLink[];
}

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  'routing-basics': {
    root: '/features/routing-basics',
    nextStep: [
      { href: '/features/routing-nested/index.html', label: 'вложенные маршруты' },
      { href: '/features/routing-advanced/index.html', label: 'продвинутое сопоставление URL' },
    ],
  },
  'routing-nested': {
    root: '/features/routing-nested',
    layout: {
      usersChromeLabel:
        'Оболочка layout — навигация и рамка; при переключении sibling-маршрутов не размонтируется',
      usersNav: [
        { path: '/users', label: 'Список' },
        { path: '/users/1', label: 'User 1' },
        { path: '/users/2', label: 'User 2' },
        { path: '/users/3', label: 'User 3' },
        { path: '/users/unknown', label: '404 demo' },
      ],
      slotLabelL1: 'Слот view — сюда монтирует дочерний маршрут',
    },
    nextStep: [
      {
        href: '/features/routing-advanced/index.html',
        label: 'третий уровень вложенности, приоритет matching и catch-all',
      },
    ],
  },
  'routing-advanced': {
    root: '/features/routing-advanced',
    layout: {
      usersChromeLabel: 'Первый уровень — общая оболочка ветки /users',
      usersNav: [
        { path: '/users', label: 'Список' },
        { path: '/users/about', label: 'О разделе' },
        { path: '/users/1', label: 'User 1' },
      ],
      slotLabelL1: 'Слот L1 — view или layout второго уровня',
      userChromeLabel: 'Второй уровень — оболочка профиля /users/:id',
      userNav: [
        { path: '/users/1', label: 'Профиль' },
        { path: '/users/1/settings', label: 'Настройки' },
      ],
      slotLabelL2: 'Слот L2 — конечный view',
    },
    nextStep: [
      { href: '/features/phase-update/index.html', label: 'update shortcut: search, hash, :id, param-update' },
    ],
  },
  'phase-update': {
    root: '/features/phase-update',
    nextStep: [{ href: '/features/animations/index.html', label: 'анимации переходов: fade, slide, transition-order' }],
  },
  animations: {
    root: '/features/animations',
    nextStep: [{ href: '/', label: 'оглавление демо' }],
  },
};

export const DEMO_ROOTS = Object.values(DEMO_SCENARIOS).map((s) => s.root);

export function getDemoScenario(id: string | undefined): DemoScenario | undefined {
  if (!id) return undefined;
  return DEMO_SCENARIOS[id];
}

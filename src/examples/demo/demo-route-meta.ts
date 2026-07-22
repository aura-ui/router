/** Одна строка в блоке demo-facts. */
export type DemoRouteFact =
  | { term: string; kind: 'code'; value: string }
  | { term: string; kind: 'text'; value: string }
  | { term: string; kind: 'html'; value: string }
  | { term: string; kind: 'param'; param: 'id' | 'tab' | 'section' | 'transition-order'; hint?: string };

/**
 * Метаданные view по пути partial (атрибут data-demo-view на &lt;article&gt;).
 *
 * Новая view-страница:
 * 1. data-demo-view="features/…/page.html" на article
 * 2. запись в DEMO_VIEW_META
 */
export const DEMO_VIEW_META: Record<string, DemoRouteFact[]> = {
  'features/routing-basics/page-a.html': [
    { term: 'Path', kind: 'code', value: '/features/routing-basics/a' },
    { term: 'View', kind: 'code', value: 'features/routing-basics/page-a.html' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Сопоставление path → загрузка HTML-фрагмента → монтирование в корневой outlet.',
    },
  ],
  'features/routing-basics/page-b.html': [
    { term: 'Path', kind: 'code', value: '/features/routing-basics/b' },
    { term: 'View', kind: 'code', value: 'features/routing-basics/page-b.html' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value:
        'Выход из маршрута A, вход в маршрут B: предыдущий view размонтирован, новый отрисован в том же outlet.',
    },
  ],
  'features/routing-nested/users-list.html': [
    {
      term: 'Path',
      kind: 'code',
      value: '/features/routing-nested/users (path=".")',
    },
    { term: 'View', kind: 'code', value: 'features/routing-nested/users-list.html' },
    { term: 'Layout', kind: 'code', value: 'users-layout' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Layout смонтирован один раз; список отрисован во вложенном outlet.',
    },
  ],
  'features/routing-nested/user.html': [
    { term: 'Path', kind: 'code', value: '/features/routing-nested/users/:id' },
    { term: 'View', kind: 'code', value: 'features/routing-nested/user.html' },
    { term: 'Layout', kind: 'code', value: 'users-layout' },
    { term: 'Параметр id', kind: 'param', param: 'id' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Update во вложенном outlet; users-layout остаётся смонтированным.',
    },
  ],
  'features/routing-nested/not-found.html': [
    { term: 'Path', kind: 'code', value: '/features/routing-nested/users/*' },
    { term: 'View', kind: 'code', value: 'features/routing-nested/not-found.html' },
    { term: 'Layout', kind: 'code', value: 'users-layout' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Scoped catch-all: sidebar layout сохраняется, 404 только во вложенном outlet.',
    },
  ],
  'features/routing-advanced/users-list.html': [
    {
      term: 'Path',
      kind: 'code',
      value: '/features/routing-advanced/users (path=".")',
    },
    { term: 'View', kind: 'code', value: 'features/routing-advanced/users-list.html' },
    { term: 'Layout', kind: 'code', value: 'users-layout' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Index-view ветки /users внутри layout первого уровня.',
    },
  ],
  'features/routing-advanced/users-about.html': [
    { term: 'Path', kind: 'code', value: '/features/routing-advanced/users/about' },
    { term: 'View', kind: 'code', value: 'features/routing-advanced/users-about.html' },
    { term: 'Layout', kind: 'code', value: 'users-layout' },
    {
      term: 'Приоритет',
      kind: 'html',
      value: 'статический сегмент &gt; <code>:id</code> &gt; <code>*</code>',
    },
  ],
  'features/routing-advanced/user.html': [
    { term: 'Path', kind: 'code', value: '/features/routing-advanced/users/:id' },
    { term: 'View', kind: 'code', value: 'features/routing-advanced/user.html' },
    {
      term: 'Layout',
      kind: 'html',
      value: '<code>users-layout</code> → <code>user-layout</code>',
    },
    { term: 'Параметр id', kind: 'param', param: 'id' },
  ],
  'features/routing-advanced/user-settings.html': [
    {
      term: 'Path',
      kind: 'code',
      value: '/features/routing-advanced/users/:id/settings',
    },
    { term: 'View', kind: 'code', value: 'features/routing-advanced/user-settings.html' },
    {
      term: 'Layout',
      kind: 'html',
      value: '<code>users-layout</code> → <code>user-layout</code>',
    },
    { term: 'Параметр id', kind: 'param', param: 'id' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value:
        'Sibling-переключение внутри user-layout; оба layout-уровня остаются смонтированными.',
    },
  ],
  'features/routing-advanced/not-found.html': [
    { term: 'Path', kind: 'code', value: 'path="*"' },
    { term: 'View', kind: 'code', value: 'features/routing-advanced/not-found.html' },
    {
      term: 'URL',
      kind: 'text',
      value: 'сохранён в адресной строке (см. панель выше)',
    },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Declarative 404-view вместо engine fallback.',
    },
  ],
  'features/phase-update/search.html': [
    { term: 'Pathname', kind: 'code', value: '/features/phase-update/search' },
    { term: 'View', kind: 'code', value: 'features/phase-update/search.html' },
    {
      term: 'Query tab',
      kind: 'param',
      param: 'tab',
      hint: '(search)',
    },
    {
      term: 'Pipeline',
      kind: 'code',
      value: 'runUpdate()',
    },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Тот же route record → load → history → update-хуки. Без render и unmount.',
    },
  ],
  'features/phase-update/hash.html': [
    { term: 'Pathname', kind: 'code', value: '/features/phase-update/hash' },
    { term: 'View', kind: 'code', value: 'features/phase-update/hash.html' },
    {
      term: 'Якорь',
      kind: 'param',
      param: 'section',
      hint: '(hash)',
    },
    {
      term: 'Pipeline',
      kind: 'code',
      value: 'finalizeHashOnlyNavigation',
    },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'History + scroll. Processor и хуки не вызываются — view остаётся в DOM.',
    },
  ],
  'features/phase-update/user-shell.html': [
    { term: 'Route', kind: 'code', value: '/features/phase-update/update/:id' },
    { term: 'View', kind: 'code', value: 'features/phase-update/user-shell.html' },
    { term: 'Параметр id', kind: 'param', param: 'id' },
    {
      term: 'Pipeline',
      kind: 'code',
      value: 'runUpdate()',
    },
    {
      term: 'Действие роутера',
      kind: 'text',
      value:
        'viewKey user-shell.html на все id; тот же leaf, тот же viewKey — runUpdate(), не FULL.',
    },
  ],
  'features/phase-update/user-1.html': [
    { term: 'Route', kind: 'code', value: '/features/phase-update/remount/:id' },
    { term: 'Path', kind: 'code', value: '/features/phase-update/remount/1' },
    { term: 'View', kind: 'code', value: 'features/phase-update/user-1.html' },
    { term: 'Параметр id', kind: 'param', param: 'id' },
    {
      term: 'Pipeline',
      kind: 'code',
      value: 'FULL (synthetic remount)',
    },
    {
      term: 'Действие роутера',
      kind: 'text',
      value:
        'Шаблон user-{{id}}.html → user-1.html; тот же leaf, другой viewKey — FULL, не update.',
    },
  ],
  'features/phase-update/user-2.html': [
    { term: 'Route', kind: 'code', value: '/features/phase-update/remount/:id' },
    { term: 'Path', kind: 'code', value: '/features/phase-update/remount/2' },
    { term: 'View', kind: 'code', value: 'features/phase-update/user-2.html' },
    { term: 'Параметр id', kind: 'param', param: 'id' },
    {
      term: 'Pipeline',
      kind: 'code',
      value: 'FULL (synthetic remount)',
    },
    {
      term: 'Действие роутера',
      kind: 'text',
      value:
        'Шаблон user-{{id}}.html → user-2.html; тот же leaf, другой viewKey — FULL, не update.',
    },
  ],
  'features/animations/page-a.html': [
    { term: 'Path', kind: 'code', value: '/features/animations/a' },
    { term: 'View', kind: 'code', value: 'features/animations/page-a.html' },
    { term: 'Transition', kind: 'code', value: 'fade (parallel)' },
    { term: 'transition-order', kind: 'param', param: 'transition-order' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'Staged mount: outgoing и incoming view в outlet; хуки fade на transitionOut/In.',
    },
  ],
  'features/animations/page-b.html': [
    { term: 'Path', kind: 'code', value: '/features/animations/b' },
    { term: 'View', kind: 'code', value: 'features/animations/page-b.html' },
    { term: 'Transition', kind: 'code', value: 'fade (parallel)' },
    { term: 'transition-order', kind: 'param', param: 'transition-order' },
    {
      term: 'Действие роутера',
      kind: 'text',
      value: 'После commit staged view становится active; outgoing root размонтирован.',
    },
  ],
};

export function getViewMeta(viewId: string | undefined): DemoRouteFact[] | undefined {
  if (!viewId) return undefined;
  return DEMO_VIEW_META[viewId];
}

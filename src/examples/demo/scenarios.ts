/** Метаданные сценариев — заголовок и подсказка для панели демо */
export const SCENARIOS: Record<string, { title: string; hint: string; group?: string }> = {
  '/': {
    title: 'С чего начать',
    hint: 'Выберите тему слева — справа покажется результат навигации',
    group: 'Старт',
  },
  '/loaders/html': {
    title: 'HTML прямо в маршруте',
    hint: 'Контент в атрибуте view — страница без дополнительных запросов',
    group: 'Загрузка',
  },
  '/loaders/fetch': {
    title: 'HTML с сервера',
    hint: 'Файл подгружается по сети; при повторном визите view кешируется (preserve)',
    group: 'Загрузка',
  },
  '/loaders/template': {
    title: 'Клон из <template>',
    hint: 'Фрагмент берётся из элемента template в DOM — удобно для SSR',
    group: 'Загрузка',
  },
  '/loaders/custom': {
    title: 'Свой загрузчик',
    hint: 'LoaderFn зарегистрирован через AuraRouter.registerLoader',
    group: 'Загрузка',
  },
  '/loaders/component': {
    title: 'Web Component',
    hint: 'Динамический import и монтирование custom element',
    group: 'Загрузка',
  },
  '/loaders/slow': {
    title: 'Состояние загрузки',
    hint: 'Пока loader ждёт — показывается loading-template',
    group: 'Загрузка',
  },
  '/loaders/error': {
    title: 'Ошибка загрузки',
    hint: 'Сбой loader → error-template и событие navigation-error',
    group: 'Загрузка',
  },
  '/routing/users': {
    title: 'Вложенный layout',
    hint: 'Родительский маршрут рисует оболочку, дочерний — контент внутри outlet',
    group: 'Маршруты',
  },
  '/routing/users/about': {
    title: 'Дочерний маршрут',
    hint: 'URL /routing/users/about — контент в том же layout, preserve сохраняет поле ввода',
    group: 'Маршруты',
  },
  '/routing/user/1': {
    title: 'Параметр :id в URL',
    hint: 'Сегмент /routing/user/1 передаётся в компонент как params.id',
    group: 'Маршруты',
  },
  '/routing/user/2': {
    title: 'Параметр :id в URL',
    hint: 'Сегмент /routing/user/2 передаётся в компонент как params.id',
    group: 'Маршруты',
  },
  '/routing/user/3': {
    title: 'Параметр :id в URL',
    hint: 'Сегмент /routing/user/3 передаётся в компонент как params.id',
    group: 'Маршруты',
  },
  '/routing/user/4': {
    title: 'Параметр :id в URL',
    hint: 'Сегмент /routing/user/4 передаётся в компонент как params.id',
    group: 'Маршруты',
  },
  '/hooks/protected': {
    title: 'Защищённая страница',
    hint: 'Без авторизации enter="auth" перенаправит на /login',
    group: 'Доступ',
  },
  '/login': {
    title: 'Страница входа',
    hint: 'Сюда попадают гости — нажмите «Войти» и вернитесь к защищённому маршруту',
    group: 'Доступ',
  },
  '/t/home': {
    title: 'Анимация fade',
    hint: 'Переключайте Home ↔ About и меняйте порядок анимации слева',
    group: 'Анимации',
  },
  '/t/about': {
    title: 'Анимация fade',
    hint: 'Переключайте Home ↔ About и меняйте порядок анимации слева',
    group: 'Анимации',
  },
  '/t/gallery': {
    title: 'Анимация slide',
    hint: 'Горизонтальный slide — другой transition hook',
    group: 'Анимации',
  },
  '/ux/scroll': {
    title: 'Восстановление прокрутки',
    hint: 'Прокрутите вниз, уйдите на другую страницу и вернитесь',
    group: 'Поведение',
  },
};

export function resolveScenario(path: string): { title: string; hint: string; group: string } {
  if (SCENARIOS[path]) {
    const s = SCENARIOS[path]!;
    return { title: s.title, hint: s.hint, group: s.group ?? 'Демо' };
  }

  if (path.startsWith('/routing/user/')) {
    const id = path.split('/').pop() ?? '?';
    return {
      title: `Профиль пользователя #${id}`,
      hint: 'Динамический сегмент :id из URL попадает в компонент',
      group: 'Маршруты',
    };
  }

  if (path.startsWith('/t/')) {
    return SCENARIOS['/t/home']!;
  }

  return {
    title: 'Страница не найдена',
    hint: 'Сработал catch-all маршрут path="*"',
    group: 'Ошибки',
  };
}

/** Метаданные сценариев — заголовок, подсказка и фрагмент конфига маршрута */
export type ScenarioMeta = {
  title: string;
  hint: string;
  group?: string;
  recipe?: string;
};

export const SCENARIOS: Record<string, ScenarioMeta> = {
  '/': {
    title: 'Каталог историй',
    hint: 'Выберите карточку — откроется сценарий без перезагрузки',
    group: 'Старт',
    recipe: 'path="/" view="demo/welcome.html" after="analytics"',
  },
  '/dev': {
    title: 'Хаб разработчика',
    hint: 'Все loaders, scroll, prefetch и прочие сценарии',
    group: 'Dev',
    recipe: 'path="/dev" view="demo/dev-hub.html" after="analytics"',
  },
  '/loaders/html': {
    title: 'HTML прямо в маршруте',
    hint: 'Контент в атрибуте view — страница без дополнительных запросов',
    group: 'Загрузка',
    recipe: 'path="/loaders/html" view="demo/loaders-html.html" after="analytics"',
  },
  '/loaders/fetch': {
    title: 'HTML с сервера',
    hint: 'Файл подгружается по сети; при повторном визите view кешируется (preserve)',
    group: 'Загрузка',
    recipe: 'path="/loaders/fetch" view="partials/fetch.html" preserve after="analytics"',
  },
  '/loaders/template': {
    title: 'Клон из <template>',
    hint: 'Фрагмент берётся из элемента template в DOM — удобно для SSR',
    group: 'Загрузка',
    recipe: 'path="/loaders/template" view="template::app"',
  },
  '/loaders/custom': {
    title: 'Свой загрузчик',
    hint: 'LoaderFn зарегистрирован через AuraRouter.registerLoader',
    group: 'Загрузка',
    recipe: 'path="/loaders/custom" view="custom-loader::demo"',
  },
  '/loaders/component': {
    title: 'Web Component',
    hint: 'Динамический import и монтирование custom element',
    group: 'Загрузка',
    recipe: 'path="/loaders/component" view="component-src::…/test-element" preserve',
  },
  '/loaders/slow': {
    title: 'Состояние загрузки',
    hint: 'Пока loader ждёт — показывается loading-template',
    group: 'Загрузка',
    recipe: 'path="/loaders/slow" view="slow-loader::demo"',
  },
  '/loaders/error': {
    title: 'Ошибка загрузки',
    hint: 'Сбой loader → error-template и событие navigation-error',
    group: 'Загрузка',
    recipe: 'path="/loaders/error" view="component-src::…/broken-element"',
  },
  '/routing/users': {
    title: 'Вложенный layout',
    hint: 'Родительский маршрут рисует оболочку, дочерний — контент внутри outlet',
    group: 'Маршруты',
    recipe: 'path="/routing/users" layout="users-layout"',
  },
  '/routing/users/about': {
    title: 'Дочерний маршрут',
    hint: 'URL /routing/users/about — контент в том же layout, preserve сохраняет поле ввода',
    group: 'Маршруты',
    recipe: 'path="about" view="partials/users-about.html" preserve',
  },
  '/routing/user/1': {
    title: 'Параметр :id в URL',
    hint: 'Сегмент /routing/user/1 передаётся в компонент как params.id',
    group: 'Маршруты',
    recipe: 'path="/routing/user/:id" view="component-src::…/test-element"',
  },
  '/hooks/protected': {
    title: 'Защищённая страница',
    hint: 'Без авторизации enter="auth" перенаправит на /login',
    group: 'Доступ',
    recipe: 'path="/hooks/protected" enter="auth" view="demo/protected.html"',
  },
  '/login': {
    title: 'Страница входа',
    hint: 'Сюда попадают гости — нажмите «Войти» и вернитесь к защищённому маршруту',
    group: 'Доступ',
    recipe: 'path="/login" view="demo/login.html"',
  },
  '/t/home': {
    title: 'Анимация fade',
    hint: 'Переключайте Home ↔ About и меняйте порядок анимации слева',
    group: 'Анимации',
    recipe: 'path="/t/home" transition-in="fade" transition-out="fade"',
  },
  '/t/about': {
    title: 'Анимация fade',
    hint: 'Переключайте Home ↔ About и меняйте порядок анимации слева',
    group: 'Анимации',
    recipe: 'path="/t/about" transition-in="fade" transition-out="fade"',
  },
  '/t/gallery': {
    title: 'Анимация slide',
    hint: 'Горизонтальный slide — другой transition hook',
    group: 'Анимации',
    recipe: 'path="/t/gallery" transition-in="slide" transition-out="slide"',
  },
  '/ux/scroll': {
    title: 'Восстановление прокрутки',
    hint: 'Прокрутите вниз, уйдите на другую страницу и вернитесь',
    group: 'Поведение',
    recipe: 'path="/ux/scroll" view="demo/scroll.html" scroll="restore"',
  },
};

export function resolveScenario(path: string): {
  title: string;
  hint: string;
  group: string;
  recipe: string;
} {
  if (SCENARIOS[path]) {
    const s = SCENARIOS[path]!;
    return {
      title: s.title,
      hint: s.hint,
      group: s.group ?? 'Демо',
      recipe: s.recipe ?? `path="${path}"`,
    };
  }

  if (path.startsWith('/routing/user/')) {
    const id = path.split('/').pop() ?? '?';
    return {
      title: `Профиль пользователя #${id}`,
      hint: 'Динамический сегмент :id из URL попадает в компонент',
      group: 'Маршруты',
      recipe: 'path="/routing/user/:id" view="component-src::…/test-element"',
    };
  }

  if (path.startsWith('/t/')) {
    const s = SCENARIOS['/t/home']!;
    return {
      title: s.title,
      hint: s.hint,
      group: s.group ?? 'Анимации',
      recipe: s.recipe ?? 'path="/t/home" transition-in="fade"',
    };
  }

  return {
    title: 'Страница не найдена',
    hint: 'Сработал catch-all маршрут path="*"',
    group: 'Ошибки',
    recipe: 'path="*" view="template::404-template"',
  };
}

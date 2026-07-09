# aura-router

Web Component `<aura-router>` — корневой элемент SPA-навигации. Собирает дочерние `<aura-route>`, делегирует матчинг и history в `AuraRoutingEngine`, подключает route hooks и обрабатывает 404.

## Быстрый старт

```html
<template id="404-template">
  <h1>404</h1>
  <p>URL: <span data-not-found-url></span></p>
</template>

<aura-router>
  <aura-route path="/" source="html" data-content="<h1>Home</h1>"></aura-route>
  <aura-route path="/users" source="html-src" data-content="users.html"></aura-route>
  <aura-route path="*" source="template" data-content="404-template"></aura-route>
</aura-router>
```

```ts
import { AuraRouter } from './modules/aura-router/core';

AuraRouter.use(myHook);
AuraRouter.configure({ notFoundHandler: (url, router) => { /* ... */ } });
```

## API

### Атрибуты `<aura-router>`

| Атрибут | Описание |
|---------|----------|
| `prefetch` | Default prefetch для in-app ссылок: `intent` (default), `tap`, `false` / `none` (off). Override на ссылке: `data-prefetch`. |
| `links-selector` | CSS-селектор in-app ссылок для перехвата кликов. По умолчанию: `[data-router-link]`. |
| `not-found-template` | Id `<template>` для **fallback**-404 (см. ниже). Используется только когда нет `<aura-route path="*">`. |

### Атрибуты `<aura-route>` (prefetch)

| Атрибут | Описание |
|---------|----------|
| `prefetch` | Per-route default (наследуется от `<aura-router>`). Каскад: `data-prefetch` на ссылке → `prefetch` на route → `prefetch` на router. |

### Статические методы

- `AuraRouter.use(hook, options?)` — регистрация глобального route hook.
- `AuraRouter.configure(options)` — глобальная конфигурация (`contentLoaderService`, `notFoundHandler`).
- `AuraRouter.registerLoader(loaderId, fn)` — регистрация кастомного loader в `defaultLoaderRegistry` (`view="loaderId::content"`).

### Методы экземпляра

- `navigate(path, options?)` — программная навигация (`replace`, `syncHistory`).
- `setNotFoundHandler(handler | null)` — per-instance fallback handler (перекрывает `configure` и `not-found-template`).
- `refreshRoutes()` — перечитать дочерние `<aura-route>` в registry движка.

### Экспорты

- `AURA_ROUTER_NOT_FOUND` — имя события `'not-found'`.
- `AURA_ROUTER_NAVIGATION_ERROR` — `'navigation-error'` (поле `code` — стабильный код ошибки).
- `AURA_ROUTER_NAVIGATION_HOOK_ERROR` — `'navigation-hook-error'` (падение `error="…"` hook).
- Типы: `NotFoundHandler`, `NavigationFailureCode`, `AuraRouterNavigationErrorEventDetail`, …

## События ошибок навигации

```ts
router.addEventListener('navigation-error', (event) => {
  const { error, code, phase, viewCommitted } = event.detail;
  // code: 'RENDER_FAILED' | 'LOAD_FAILED' | 'NOT_FOUND' | …
});

router.addEventListener('navigation-hook-error', (event) => {
  const { error, parent } = event.detail;
  // parent — исходная navigation failure, которую обрабатывал error hook
});
```

`router.addEventListener('navigation-error', …)` — единственный способ подписки на ошибки навигации.

## Обработка 404

Роутер поддерживает **два независимых пути**. Рекомендуется декларативный.

### 1. Декларативный 404 — `<aura-route path="*">`

Catch-all маршрут матчит любой pathname, но **проигрывает** конкретным маршрутам (`/users` важнее `*`).

Переход идёт через обычный lifecycle: `leave`/`guard` → load → render → commit URL. Контент рендерит `AuraRoute` (template, html, component-src и т.д.).

После успешного commit:

1. Скрывается fallback-outlet роутера (`notFound.hide()`).
2. Если сработал catch-all — диспатчится событие `not-found` с `source: 'route'`.

```html
<aura-route path="*" source="template" data-content="404-template"></aura-route>
```

В catch-all в `params` доступен `splat` — pathname без ведущего `/` (например, `/foo/bar` → `{ splat: 'foo/bar' }`).

### 2. Fallback 404 — без `<aura-route path="*">`

Если ни один маршрут не подошёл и catch-all не зарегистрирован, engine создаёт structured `NOT_FOUND` failure:

1. У предыдущего маршрута вызывается `onUnmount` (фаза `unmount`).
2. Диспатчится cancelable `not-found` (`source: 'fallback'`).
3. При отсутствии `preventDefault()` — fallback UI (`recover()`).
4. URL коммитится в history (для push/replace), чтобы адресная строка отражала несуществующий путь.

Цепочка fallback-UI (по приоритету):

| # | Источник | API |
|---|----------|-----|
| 1 | Handler экземпляра | `router.setNotFoundHandler(fn)` |
| 2 | Глобальный handler | `AuraRouter.configure({ notFoundHandler })` |
| 3 | Шаблон | атрибут `not-found-template` на `<aura-router>` |
| 4 | Дефолт | текст `Page not found: {url}` в root `<aura-outlet>` |

Перед показом UI диспатчится cancelable-событие `not-found` с `source: 'fallback'`. Если вызвать `event.preventDefault()`, встроенный fallback не отрисуется.

В шаблоне fallback URL подставляется в элементы с атрибутом `[data-not-found-url]`.

```html
<aura-router not-found-template="404-template">
  <aura-outlet></aura-outlet>
  <aura-route path="/" source="html" data-content="<h1>Home</h1>"></aura-route>
  <!-- path="*" нет — неизвестные пути пойдут в fallback -->
</aura-router>
```

### Событие `not-found`

```ts
router.addEventListener('not-found', (event: AuraRouterNotFoundEvent) => {
  const { url, source } = event.detail;
  // source: 'route'   — сработал <aura-route path="*">
  // source: 'fallback' — сработал тонкий fallback роутера
});
```

| | `path="*"` | Fallback |
|---|------------|----------|
| Route lifecycle | ✅ | ❌ (только `onUnmount` у предыдущего) |
| Контент | через `AuraRoute` | handler / template / текст |
| `source` в событии | `'route'` | `'fallback'` |

## Структура модуля

```
aura-router/
├── core.ts                              # public entry
└── core/
    ├── aura-router.ts                   # <aura-router> element
    ├── aura-router-not-found-controller.ts
    └── navigation-events.ts             # DOM event types + dispatch helpers
```

## Связанные модули

- `aura-route` — декларация маршрутов и lifecycle.
- `aura-routing-engine` — матчинг URL, history, processor.
- `aura-route-hooks` — глобальные hooks (`AuraRouter.use`).

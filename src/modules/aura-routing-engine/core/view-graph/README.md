# view-graph

Модуль загрузки **view-payload** для маршрутов: layout из `<template>`, HTML, HTTP, web components и кастомные источники.

По форме API симметричен [`data-graph/`](../data-graph) — `load` → cache → prefetch → invalidate — но работает с **разметкой** (строки и DOM-узлы), а не с данными load-hook'ов.

На одном `AuraRouter` создаётся один экземпляр `ViewGraph`. Он общий для render pipeline, branch-resolve и link prefetch.

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Концепции](#концепции)
- [Пайплайн](#пайплайн)
- [Публичный API](#публичный-api)
- [Встроенные loaders](#встроенные-loaders)
- [Кастомный loader](#кастомный-loader)
- [Кеш и инвалидация](#кеш-и-инвалидация)
- [Prefetch](#prefetch)
- [Контракты](#контракты)
- [Интеграция](#интеграция)
- [Структура модуля](#структура-модуля)
- [См. также](#см-также)

---

## Быстрый старт

Импорт из barrel модуля или `aura-routing-engine/core`:

```ts
import {
  ViewGraph,
  PayloadCache,
  defaultLoaderRegistry,
} from '…/core/view-graph';

const viewGraph = new ViewGraph({
  registry: defaultLoaderRegistry,
  cache: new PayloadCache(),
});

const payload = await viewGraph.loadView(routeInfo, signal, { data: hookSnapshot });
// ViewPayload: string | Node | null
```

Кастомный loader регистрируется на роутере одной строкой — подробнее в разделе [Кастомный loader](#кастомный-loader).

---

## Концепции

### `ViewKind`

```ts
type ViewKind = 'layout' | 'view';
```

| Kind | Атрибут маршрута | Loader | `descriptor.cache` |
|------|------------------|--------|------------------|
| `layout` | `layout="template-id"` | `template` | всегда `false` |
| `view` | `view="…"` (см. синтаксис ниже) | `resolvedView.loader` | `preserve.view` |

Если у маршрута нет ни `layout`, ни `view`, `loadView` возвращает `null` — это не ошибка.

Для `view` с loader `url` и атрибутом `extract` в descriptor попадает CSS-селектор фрагмента HTML.

**Синтаксис `view`:**

| Форма | Пример `view` | Loader | `context.content` |
|-------|---------------|--------|---------------|
| bare content | `view="partials/page.html"` | `url` (по умолчанию) | `partials/page.html` |
| built-in | `view="html::<p/>"` | `html` | `<p/>` |
| built-in | `view="import::./widget.js"` | `import` | `./widget.js` |
| custom | `view="charts::dashboard"` | `charts` | `dashboard` |

Разделитель loader и content — `::`. Левая часть выбирает loader, правая попадает в **`context.content`**. Селектор фрагмента — отдельный атрибут `extract`, не в `view`.

### Два уровня типа результата

| Уровень | Тип | Где используется |
|---------|-----|------------------|
| Loader | `ViewLoadResult` | `html` \| `markup` \| `fragment` |
| Graph / route | `ViewPayload` | `string` \| `Node` |

`ViewGraph` приводит результат loader'а к `ViewPayload`: `html` и `markup` → строка, `fragment` → узел.

Для `registry.register(type, fn)` тело loader'а — `LoaderFn`, возвращающий `string | Node | null`. `FnLoader` преобразует строку в `{ kind: 'html' }`, а `Node` — во `DocumentFragment` (через `appendChild`, если узел ещё не fragment).

### Три хранилища (не смешивать)

| Store | Модуль | Содержимое | Когда участвует |
|-------|--------|------------|-----------------|
| `PayloadCache` | `cache/` | строки payload | `preserve.view` |
| `ViewCache` | aura-route | detached DOM | `preserve.view` + keep-alive |
| `DataGraph` | data-graph | данные load-hook'ов | `preserve.data` |

Инвалидация для graph-cache'ей — общий контракт `RouterInvalidateOptions`, но backends разные.

---

## Пайплайн

```text
MatchedRouteInfo
      │
      ▼
buildViewDescriptor(route, resolvedView)   ← private, внутри loadView
      │
      ▼
PayloadCache.resolve(key)?                 ← только если descriptor.cache
      │
      ▼
LoaderRegistry.get(loader).load(context)
      │
      ▼
ViewPayload
```

**Порты** — узкий surface для DI и моков:

| Тип | Методы | Потребитель |
|-----|--------|-------------|
| `ViewLoadPort` | `loadView`, `prefetchBranch` | prefetch executor |
| `ViewResolverPort` | `loadView` | `RouteViewController` |
| `BranchViewResolver` | `loadView` | branch-atomic resolve |

---

## Публичный API

Экспорт из `index.ts` намеренно узкий.

| Группа | Символы |
|--------|---------|
| Orchestration | `ViewGraph`, `ViewGraphDeps`, `ViewPrefetchOptions`, `RouteViewSource`, `ViewLoadPort` |
| Cache | `PayloadCache`, `payloadCacheKey` |
| Registry | `LoaderRegistry`, `createLoaderRegistry`, `defaultLoaderRegistry`, `Loader`, `LoaderClass`, `LoaderFn` |
| Types | `ViewPayload`, `ViewLoadContext`, `ViewDescriptor`, `ViewKind`, `ViewLoadResult`, `ViewLoaderEnv`, `FetchText` |

**Не в barrel** (прямой импорт или `aura-routing-engine/core`): `loaders/*`, `environment.ts`, `markup.ts`.

Классы built-in loader'ов реэкспортируются из `aura-routing-engine/core.ts` — для тестов и сборки кастомного registry.

---

## Встроенные loaders

| `LoaderId` | Атрибут | `context.content` | `ViewLoadResult` |
|--------------|---------|---------------|------------------|
| `template` | `layout="id"` (не `view`) | id шаблона | `fragment` |
| `html` | `html::…` | inline HTML | `html` |
| `url` | bare content или `url::…` | путь для fetch | `html` (+ `extract`) |
| `component` | `component::tag` | имя custom element | `markup` + `aura-data` |
| `import` | `import::./mod.js` | путь модуля | `markup` |
| `iframe` | `iframe::https://…` | URL в `src` | `markup` |

### `LoaderRegistry.register`

Один метод — три формы вызова:

```ts
registry.register(loader);              // готовый экземпляр
registry.register(LoaderClass);         // класс → new Loader(env)
registry.register('type', loaderFn);    // функция → FnLoader
```

Повторная регистрация того же типа перезаписывает loader с `console.warn`.

---

## Кастомный loader

Два способа расширить registry. Для большинства приложений достаточно **функции**. **Класс** — когда нужны `ViewLoaderEnv`, состояние на экземпляре или явный `ViewLoadResult` (`markup` / `fragment`).

### Функция (рекомендуется)

```ts
import { AuraRouter } from '@aura-ui-web/router';

AuraRouter.registerLoader('charts', async (context) => {
  // view="charts::dashboard" → context.content === 'dashboard'
  const response = await fetch(`/api/chart/${context.content}`, {
    signal: context.signal,
  });
  return response.text();
});
```

```html
<aura-route path="/analytics" view="charts::dashboard" />
```

Запрос: `GET /api/chart/dashboard`. Часть после `::` — это `context.content`, не `context.route.pattern`.

| Возврат `LoaderFn` | Что делает `FnLoader` |
|--------------------|------------------------|
| `string` | `{ kind: 'html', html }` |
| `Node` | `{ kind: 'fragment', node }` (обёртка во `DocumentFragment`) |
| `null` | пустой view, не ошибка |

Тот же контракт на изолированном registry: `registry.register('charts', fn)`.

### Класс (продвинутый)

Наследуйте `Loader` и объявите **только** `static readonly type`. Поле `instance.type` выставляет базовый конструктор — дублировать его в подклассе не нужно.

```ts
import { Loader, type ViewLoadContext, type ViewLoadResult } from '…/core/view-graph';
import type { LoaderId } from '…/aura-route/core/attr/view-attr-parser';

export class MarkdownLoader extends Loader {
  static readonly type = 'markdown' as const satisfies LoaderId;

  async load(context: ViewLoadContext): Promise<ViewLoadResult | null> {
    // view="markdown::docs/guide.md" → context.content === 'docs/guide.md'
    const text = await this.env.fetchText(this.env.resolveUrl(context.content), context.signal);
    const html = renderMarkdown(text);
    return { kind: 'html', html };
  }
}
```

Регистрация:

```ts
defaultLoaderRegistry.register(MarkdownLoader);
// или с кастомным env:
defaultLoaderRegistry.register(new MarkdownLoader(customEnv));
```

```html
<aura-route view="markdown::docs/guide.md" />
```

Класс уместен, когда:

- нужен `this.env.fetchText` / `resolveUrl` без замыканий;
- результат — `markup` или `fragment`, а не сахар `LoaderFn`;
- на экземпляре есть несколько методов или внутреннее состояние.

### `ViewLoadContext` и `ViewLoaderEnv`

Аргумент loader'а — `ViewLoadContext` (в примерах ниже — `context`):

| Поле | Откуда | Пример |
|------|--------|--------|
| `content` | правая часть `view` после `::` (или bare content для `url`) | `dashboard` из `charts::dashboard` |
| `kind` | `layout` или `view` | `view` |
| `extract` | атрибут `extract` на маршруте (только `url`) | `#main` |
| `signal` | abort навигации | `AbortSignal` |
| `route.href` | текущий URL (pathname + search + hash) | `/analytics?q=1` |
| `route.pattern` | шаблон `path` маршрута в дереве | `/users/:id` |
| `route.params` | сегменты из pathname | `{ id: '42' }` |
| `route.query` | query string | `{ q: '1' }` |
| `data` | snapshot load-hook'ов из `DataGraph` | если передан в `loadView` |

`content` и `route.*` независимы: `view="charts::dashboard"` на `path="/analytics"` даёт `content: 'dashboard'`, `pattern: '/analytics'`.

`ViewLoaderEnv` (`fetchText`, `resolveUrl`, `isSSR`) — DI для class loader'ов. `isSSR` зарезервирован; built-in loader'ы его пока не используют.

---

## Кеш и инвалидация

**Когда кешируется:** `descriptor.cache === true`, то есть `preserve.view` на view-маршруте.

**Что кешируется:** только **строки**. `DocumentFragment` в `PayloadCache` не пишется — DOM keep-alive обслуживает `ViewCache`.

**In-flight dedup:** `AuraResolvableCache.resolve` схлопывает параллельные запросы с одним ключом.

**Формат ключа** (`payloadCacheKey`):

```text
{pathname | matchKey[+params]} | {query?} | d:{json(data)?} | {kind}:{loader}:{content} [:: {extract}]
```

Части соединяются через `|`. Суффикс `::{extract}` добавляется только для url-loader с атрибутом `extract`.

Примеры:

```text
/users/1|view:url:partials/user.html
/settings|d:%7B%7D|view:html:<p/>
```

Поле `kind` в ключе разводит layout и view при совпадении `loader:content`.

**Инвалидация:** `viewGraph.invalidate(options)` или `AuraRouter.invalidateView()`. Scope: `key`, `path`, `match`. Policy: `stale` (по умолчанию) | `remove`.

---

## Prefetch

| Метод | Назначение |
|-------|------------|
| `prefetchNode(route, signal)` | один маршрут |
| `prefetchBranch(chain, signal, opts?)` | enter chain, с ограничением параллелизма |
| `prefetchLeaf(leaf, signal, opts?)` | `getActiveChain(leaf)` + branch |

По умолчанию: `concurrency: 3`, `order: 'root-first'`.

Ошибки prefetch **не пробрасываются** — intent prefetch, как в `DataGraph`.

В engine: `ViewPrefetchExecutor` (resource kind `'view'`) при наличии `config.viewGraph`.

---

## Контракты

| Ситуация | Поведение |
|----------|-----------|
| `signal.aborted` | `null`, без `NavigationError` |
| throw из loader'а | `createViewLoadError` → `CONTENT_LOAD_FAILED`, phase `render` |
| ошибка prefetch | подавляется |
| неизвестный loader type | throw из `registry.get` |

`loadViewDescriptor(descriptor, …)` — загрузка по готовому descriptor, минуя route attrs. Используется в тестах и при явном resolve.

---

## Интеграция

```text
AuraRouter
  ├─ viewGraph: ViewGraph { registry, cache }
  ├─ registerLoader(loaderId, fn) → defaultLoaderRegistry
  └─ invalidateView() → viewGraph.invalidate()

AuraRoutingEngine
  └─ config.viewGraph → ViewPrefetchExecutor

AuraRoute / RouteViewController
  └─ config.view: router.viewGraph   // ViewResolverPort
```

Построение descriptor (`buildViewDescriptor`, `buildLoadContext`) — **private**. Снаружи доступны только `loadView` и `loadViewDescriptor`.

---

## Структура модуля

```text
view-graph/
├── index.ts           barrel (public API)
├── view-graph.ts      ViewGraph
├── types.ts
├── loader.ts          Loader, FnLoader
├── registry.ts
├── environment.ts
├── markup.ts
├── cache/
│   ├── payload-cache.ts
│   └── cache-key.ts
└── loaders/           built-in Loader classes
```

---

## См. также

- [`data-graph/`](../data-graph) — load hooks и data cache
- [`view-mount/`](../view-mount) — branch resolve/mount без loader
- [`aura-route`](../../../aura-route/core/view/) — `ViewResolverPort`, `ViewCache`, render pipeline
- [`invalidate-router-cache.ts`](../invalidate-router-cache.ts) — общая логика invalidate для graph cache'ей

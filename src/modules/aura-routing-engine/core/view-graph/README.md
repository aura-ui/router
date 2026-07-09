# view-graph

Загрузка view-payload для маршрутов: layout, HTML, URL, web components. Симметричен [`data-graph/`](../data-graph) по форме API (load → cache → prefetch → invalidate), но работает с **разметкой**, не с load-hook data.

Один экземпляр `ViewGraph` на `AuraRouter` — общий для render, branch-resolve и link prefetch.

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Концепции](#концепции)
- [Пайплайн](#пайплайн)
- [Публичный API](#публичный-api)
- [Расширение: loaders](#расширение-loaders)
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
```

```ts
const viewGraph = new ViewGraph({
  registry: defaultLoaderRegistry,
  cache: new PayloadCache(),
});

const payload = await viewGraph.loadView(routeInfo, signal, { data: hookSnapshot });
// → string | Node | null
```

Кастомный loader на роутере:

```ts
AuraRouter.registerLoader('charts', async (ctx) => {
  const res = await fetch(`/api/chart?route=${ctx.route.pattern}`, { signal: ctx.signal });
  return res.text();
});
```

`<aura-route view="charts:main">` → `registry.get('charts').load(ctx)`.

---

## Концепции

### `ViewKind`

```ts
type ViewKind = 'layout' | 'view';
```

| Kind | Route attr | Loader | `descriptor.cache` |
|------|------------|--------|-------------------|
| `layout` | `layout="template-id"` | `template` | всегда `false` |
| `view` | `view="url:…"` / `html:…` / … | `resolvedView.type` | `preserve.view` |

Нет layout и нет view → `loadView` → `null` (не ошибка).

Для `view` + `url` + attr `extract` в descriptor попадает CSS-селектор фрагмента HTML.

### Два уровня типов результата

| Уровень | Тип | Где |
|---------|-----|-----|
| Loader | `ViewLoadResult` | `html` \| `markup` \| `fragment` |
| Graph / route | `ViewPayload` | `string` \| `Node` |

`ViewGraph` схлопывает: `html`/`markup` → string, `fragment` → node.

`LoaderFn` возвращает `string | Node | null`. `FnLoader` нормализует `Node` во `DocumentFragment` (`appendChild`, если уже не fragment).

### Три store (не смешивать)

| Store | Модуль | Содержимое | Условие |
|-------|--------|------------|---------|
| `PayloadCache` | `cache/` | строки payload | `preserve.view` |
| `ViewCache` | aura-route | detached DOM | `preserve.view` + keep-alive |
| `DataGraph` | data-graph | load-hook data | `preserve.data` |

Общий контракт invalidate: `RouterInvalidateOptions`. Разные backends.

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
LoaderRegistry.get(loader).load(ctx)
      │
      ▼
ViewPayload
```

**Порты (узкий surface для DI):**

| Тип | Методы | Потребитель |
|-----|--------|-------------|
| `ViewLoadPort` | `loadView`, `prefetchBranch` | prefetch executor |
| `ViewResolverPort` | `loadView` | `RouteViewController` |
| `BranchViewResolver` | `loadView` | branch-atomic resolve |

---

## Публичный API

Экспорт из `index.ts` — намеренно узкий.

| Группа | Символы |
|--------|---------|
| Orchestration | `ViewGraph`, `ViewGraphDeps`, `ViewPrefetchOptions`, `RouteViewSource`, `ViewLoadPort` |
| Cache | `PayloadCache`, `payloadCacheKey` |
| Registry | `LoaderRegistry`, `createLoaderRegistry`, `defaultLoaderRegistry`, `Loader`, `LoaderClass`, `LoaderFn` |
| Types | `ViewPayload`, `ViewLoadContext`, `ViewDescriptor`, `ViewKind`, `ViewLoadResult`, `ViewLoaderEnv`, `FetchText` |

**Не в barrel** (прямой импорт или `aura-routing-engine/core`): `loaders/*`, `environment.ts`, `markup.ts`.

Built-in loader classes реэкспортируются из `aura-routing-engine/core.ts` для тестов и кастомного registry.

---

## Расширение: loaders

### Built-in

| `LoaderType` | Источник | Результат |
|--------------|----------|-----------|
| `template` | `<template id="…">` | `fragment` |
| `html` | inline в `ref` | `html` |
| `url` | HTTP fetch | `html` (+ `extract`) |
| `component` | `customElements.get(ref)` | `markup` + `aura-data` |
| `import` | dynamic `import()` | `markup` |
| `iframe` | `ref` как `src` | `markup` |

### `LoaderRegistry.register`

```ts
registry.register(loader);              // instance
registry.register(LoaderClass);         // class → new Loader(env)
registry.register('type', loaderFn);    // → FnLoader
```

Перезапись зарегистрированного типа — `console.warn`.

### `ViewLoadContext`

Поля, доступные в loader:

```ts
{
  ref, kind, extract?, signal,
  route: { href, pattern, params?, query? },
  data?,  // из DataGraph snapshot, если передан в loadView
}
```

`ViewLoaderEnv` (`fetchText`, `resolveUrl`, `isSSR`) — DI для class loaders. `isSSR` — задел; built-in не используют.

---

## Кеш и инвалидация

**Когда кешируется:** `descriptor.cache === true` → `preserve.view` на view-маршруте.

**Что кешируется:** только **строки**. `DocumentFragment` не пишется в `PayloadCache` — DOM keep-alive в `ViewCache`.

**In-flight dedup:** `AuraResolvableCache.resolve` — параллельные запросы с одним ключом схлопываются.

**Ключ** (`payloadCacheKey`):

```text
{pathname | matchKey[+params]} | {query?} | d:{json(data)?} | {kind}:{loader}:{ref} [:: {extract}]
```

```text
/users/1|view:url:partials/user.html
/settings|d:%7B%7D|view:html:<p/>
```

`kind` в ключе разводит layout/view при совпадении `loader:ref`.

**Инвалидация:** `viewGraph.invalidate(options)` / `AuraRouter.invalidateView()`. Scope: `key`, `path`, `match`. Policy: `stale` (default) | `remove`.

---

## Prefetch

| Метод | Описание |
|-------|----------|
| `prefetchNode(route, signal)` | один маршрут |
| `prefetchBranch(chain, signal, opts?)` | enter chain, concurrent |
| `prefetchLeaf(leaf, signal, opts?)` | `getActiveChain(leaf)` + branch |

Defaults: `concurrency: 3`, `order: 'root-first'`.

Ошибки prefetch **не пробрасываются** (intent prefetch, как в `DataGraph`).

Engine: `ViewPrefetchExecutor` (resource kind `'view'`) при `config.viewGraph`.

---

## Контракты

| Ситуация | Результат |
|----------|-----------|
| `signal.aborted` | `null`, без `NavigationError` |
| Loader throw | `createViewLoadError` → `CONTENT_LOAD_FAILED`, phase `render` |
| Prefetch error | swallowed |
| Unknown loader type | throw из `registry.get` |

`loadViewDescriptor(descriptor, …)` — escape hatch для тестов и прямого resolve без route attrs.

---

## Интеграция

```text
AuraRouter
  ├─ viewGraph: ViewGraph { registry, cache }
  ├─ registerLoader(type, fn) → defaultLoaderRegistry
  └─ invalidateView() → viewGraph.invalidate()

AuraRoutingEngine
  └─ config.viewGraph → ViewPrefetchExecutor

AuraRoute / RouteViewController
  └─ config.view: router.viewGraph   // ViewResolverPort
```

Descriptor building (`buildViewDescriptor`, `buildLoadContext`) — **private**. Снаружи только `loadView` / `loadViewDescriptor`.

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

- [`data-graph/`](../data-graph) — load hooks + data cache
- [`view-mount/`](../view-mount) — branch resolve/mount без loader
- [`aura-route`](../../../aura-route/core/view/) — `ViewResolverPort`, `ViewCache`, render pipeline
- [`invalidate-router-cache.ts`](../invalidate-router-cache.ts) — общая invalidate-логика для graph caches

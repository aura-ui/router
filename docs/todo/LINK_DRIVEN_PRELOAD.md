# TODO: Link-driven preload + router-owned data cache

> **Статус:** стратегия принята; **core реализован** — см. [../PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md)  
> **Связь:** [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) · [DATAGRAPH.md](./DATAGRAPH.md)  
> **Контекст:** решение по prefetch content-слоя для `aura-route-2` (2026-06); заменяет route-driven `preload` attr как основную модель.

### Легенда

| Метка | Значение |
|-------|----------|
| ✅ | уже есть в коде |
| 🎯 | целевое поведение |
| ⚠️ | временный / legacy |
| ❌ | не сделано |

---

## TL;DR

**Link-driven** — prefetch запускается роутером по **намерению перейти на конкретный `href`** (hover / touch / viewport / API), а не при `connectedCallback` `<aura-route>`.

**Router-owned cache** — один `DataCache` на `<aura-router>` / engine: dedupe, TTL, общий для prefetch и navigation.

Per-route объявляет **что** грузить (`source`, `content`, loader). Router решает **когда**, **для какого URL** и **куда положить результат**.

---

## Почему не route-driven `preload` attr

Сейчас (`⚠️` legacy):

```html
<aura-route path="profile" preload>
```

→ `connectedCallback` → синтетический `routeInfo` из attr `path` → `ContentResolver.preload()`.

| Проблема | Детали |
|----------|--------|
| Нет целевого URL | Для `:id` неизвестно `/users/1` vs `/users/2` |
| Nested без resolved pattern | attr `profile` ≠ pattern `/settings/profile` |
| Timing | route connect раньше `router.refreshRoutes()` / route tree |
| Лишний трафик | грузим routes, куда пользователь может не пойти |
| Cache mismatch | даже при записи в cache ключ не совпадал бы с navigation |

Временный workaround: `preload` вызывает только `fetch`, **без записи** в Data cache ([CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) §аудит #2).

**Решение:** attr `preload` на route — **не основная модель**. Целевая — link-driven + router cache (как TanStack Router, SvelteKit, React Router).

---

## Термины

| Термин | Значение |
|--------|----------|
| **Prefetch / preload** | загрузка content (и опционально data) **до** commit navigation |
| **Intent** | сигнал «скорее всего перейдём»: hover, focus, touchstart, viewport |
| **Match chain** | ветка route tree для href: `[settings, profile]` |
| **View cache** | HTML string / payload loaders; ключ `viewCacheKey` |
| **View cache** | keep-alive DOM (`RouteDomCache`) — **отдельно**, не этот документ |
| **DataGraph** | кэш `load` hooks (JSON) — **отдельно**, координация в [DATAGRAPH.md](./DATAGRAPH.md) |

---

## Целевая архитектура

```mermaid
sequenceDiagram
  participant Link as a[data-router-link]
  participant Provider as BrowserHistoryProvider
  participant Engine as AuraRoutingEngine
  participant Matcher as UrlMatcher
  participant PC as PrefetchController
  participant Content as ContentPrefetch
  participant Data as DataGraph
  participant CCache as DataCache
  participant DStore as DataGraph store

  Link->>Provider: mouseenter / focus (intent)
  Provider->>Engine: prefetchIntent(href)
  Engine->>Matcher: matchPath(pathname)
  Matcher-->>Engine: branch + targets
  Engine->>PC: prefetchIntent(href, branch, signal)

  par sibling executors
    PC->>Content: prefetch(branch)
    Content->>CCache: resolve / write
  and
    PC->>Data: prefetch(targets)
    Data->>DStore: write (soft mode)
  end

  Note over Link,DStore: позже — click navigation
  Link->>Engine: navigateTo(href)
  Engine->>Engine: runGuards
  Engine->>Data: load(targets)
  Engine->>Content: render → resolve()
  Content->>CCache: cache hit → instant resolve
```

### Разделение ответственности

```text
┌─────────────────────────────────────────────────────────────┐
│  AuraRouter / AuraRoutingEngine                             │
│  · перехват intent на [data-router-link]                    │
│  · match href → branch                                      │
│  · PrefetchController (queue, delay, staleTime, abort)      │
│  · DataCache instance (router-owned)                     │
│  · router.preload(href) / router.prefetch(href) API         │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   RouteContentLoader   DataGraph        RouteDomCache
   (per-route WHAT)     (load hooks)     (keep-alive DOM)
```

---

## Link-driven: триггеры

### Default policy (как TanStack / SvelteKit)

| Режим | Событие | Задержка | Приоритет |
|-------|---------|----------|-----------|
| `intent` (default) | `mouseenter`, `focusin`, `touchstart` | ~50ms | высокий |
| `viewport` | IntersectionObserver на ссылке | — | средний |
| `tap` | `mousedown` / `touchstart` без hover | 0 | выше intent на mobile |
| `none` | — | — | отключено |

Per-link override (целевой markup):

```html
<a href="/users/42" data-router-link data-prefetch="intent">Alice</a>
<a href="/admin" data-router-link data-prefetch="false">Admin</a>
```

Router-level default (целевой API):

```typescript
// AuraRouter.configure / attr
defaultPrefetch: 'intent' | 'viewport' | 'tap' | 'none'
defaultPrefetchDelay: 50
```

### Уже есть (`✅`)

- `[data-router-link]` — перехват **click** в `BrowserHistoryProvider`
- `linksSelector` на `<aura-router>`
- `AuraRoutingUrlMatcher.matchPath` + `MatchedRouteInfo` с resolved `pattern`

### Нужно добавить (`❌`)

- слушатели intent на том же selector (или делегирование рядом с click)
- `prefetchIntent(href)` в engine — **без** history commit
- отмена in-flight prefetch при `mouseleave` / новом intent (AbortSignal)

---

## Router-owned cache

### Принципы

1. **Один `DataCache` на router instance** — не `defaultDataCache` singleton ([CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) аудит #1).
2. **Один ключ для prefetch и navigation** — `viewCacheKey(descriptor, routeInfo)`:
   - base: `routeInfo.pathname` (конкретный URL с params)
   - fallback: `routeInfo.pattern` (только если pathname нет)
3. **In-flight dedupe** — два hover на `/users/42` → один fetch (`DataCache.resolve`).
4. **Promotion** — prefetch hit при click → `resolve()` без повторного fetch (если fresh).
5. **TTL** — `preloadStaleTime` (default ~30s, как TanStack); после stale — фоновый revalidate или sync fetch на navigation.

### Ключ кэша (актуальный код)

```typescript
// data-key.ts
const base = routeInfo.pathname ?? routeInfo.pattern;
// + query + loader:content
```

Для param routes prefetch **всегда** с конкретным `pathname` из `href` ссылки — не с pattern alone.

### Что кэшируется

| Payload | Prefetch write | Примечание |
|---------|----------------|------------|
| `string` (html, template) | ✅ | текущее ограничение v2 |
| `DocumentFragment` | ❌ | DOM move semantics |
| dynamic import (component-src) | ✅ chunk warm | отдельно `preloadCode` опционально |

---

## Поток: один prefetch запрос

```text
hover href="/settings/profile?q=1"

1. resolveDocumentHrefParts → pathname, search, hash; parseSearch(search) → query
2. matchPath(pathname) → leaf + chain
3. buildMatchedRouteInfo для каждого узла branch (или только matchable leaves с content)
4. Promise.all(branch.map(node => prefetchContent(node, routeInfo)))
5. DataCache: dedupe по ключу per route + descriptor
```

**Параллельность:** loaders по branch — **параллельно** (как Remix default `dataStrategy`). Последовательность — только если явная политика (не MVP).

**Не batch всех routes приложения** — только match chain **одного целевого href**.

---

## Координация с DataGraph

DataGraph — **отдельный параллельный блок (sibling)**, не внутри content preload и не подмодуль `ContentResolver`. Общий только **оркестратор intent** на уровне engine: один `href` → один match → два независимых fan-out.

### Модель: один триггер, два sibling-слоя

```text
hover /users/42
        │
        ▼
┌───────────────────────────────────┐
│  PrefetchController (engine)      │  ← общая «крышка»
│  · parse href                     │
│  · matchPath → branch / targets   │
│  · AbortSignal per intent         │
└───────────────┬───────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌───────────────────┐
│ ContentPrefetch│ │ DataGraph.prefetch│  ← параллельно, независимо
│ (html-src…)   │ │ (load hooks)      │
│ DataCache  │ │ DataGraph store   │  ← разные cache namespace
└───────────────┘ └───────────────────┘
```

Граница ответственности (из [DATAGRAPH.md](./DATAGRAPH.md)):

```text
ContentLoader / resolver  =  HOW: view spec → DOM
load hooks                =  WHAT: fetch для логики / props
DataGraph                 =  WHO/WHEN: load hooks + cache по targets
PrefetchController        =  WHEN intent: match + fan-out в оба слоя
```

Link-driven стратегия описывает **оркестрацию intent** и **content-исполнитель**. DataGraph — **второй исполнитель** с собственным store и политиками.

### На intent (hover)

Один вызов в engine, два параллельных кола:

```text
prefetchIntent(href):
  branch  = match(href)           // full chain для content
  targets = routesWithLoadHooks(branch)  // подмножество для DataGraph

  await Promise.all([
    contentPrefetch.prefetch(branch, { signal, mode: 'intent' }),
    dataGraph.prefetch(targets, { signal, mode: 'intent' }),
  ])
```

| | Content prefetch | `DataGraph.prefetch()` |
|--|------------------|------------------------|
| **Исполнитель** | `RouteContentLoader` → `ContentResolver` | `load` hooks через graph |
| **Payload** | HTML, template, WC string | JSON, объекты, store |
| **Guards (`enter` / `leave`)** | не вызываются | **не вызываются** |
| **Redirect из hook** | N/A | **игнор** на prefetch, в cache не пишем |
| **Ошибка** | тихо / log | тихо |
| **Cache** | `DataCache` (router-owned) | DataGraph store |
| **TTL на prefetch** | `preloadStaleTime` | `preloadStaleTime` (~30s) |
| **Targets** | branch routes с content/layout | только routes с `load` hooks |

`targets` для DataGraph могут быть **уже branch** — только узлы с `load` attr; LCA-reuse на prefetch не применяется (ещё нет navigation plan), но matcher даёт полный chain для конкретного `href`.

Общий `AbortSignal` per href; отмена при `mouseleave` / новом intent отменяет **оба** sibling-вызова.

### На navigation (click)

Prefetch **не заменяет** navigation path — только прогревает cache. Слои снова расходятся по pipeline:

```text
click /users/42

1. runGuards           enter / leave        ← только здесь; DataGraph не участвует
2. runLoads            dataGraph.load()     ← payload / throw (error) / false (cancel)
3. runRender           content.resolve()    ← свой cache; promotion после prefetch
4. runAfterRender      left / entered
```

| Фаза | Content | DataGraph |
|------|---------|-----------|
| Guards | — | — |
| Load | — | `load()` blocking |
| Render | `resolve()` | snapshot → props / `ctx.data` |
| Prefetch был | cache hit → skip fetch | cache hit → skip fetch или SWR revalidate |

### Почему не «колонка внутри content»

- разные типы payload (DOM string vs JSON) и lifecycle;
- разная политика на prefetch (redirect, errors, guards);
- LCA / `enterRoutes` в DataGraph — логика navigation `load()`, не content;
- можно prefetch только data или только content (например `preloadCode` без `load`).

### Почему не «полностью независимый остров»

- один intent → **один match** (не парсить `href` дважды);
- общий `AbortSignal` и очередь приоритетов (фаза 2);
- опционально shared infra: `AuraCacheStore` / key builder, **разные namespace**:

```text
┌──────────────── CacheStore infra (optional) ────────────────┐
│  buildKey · dedupe · TTL · gc                               │
└────────────┬────────────────────────────┬───────────────────┘
             │ namespace:content          │ namespace:data
      DataCache                  DataGraph store
```

См. open question в [DATAGRAPH.md](./DATAGRAPH.md) §единый CacheStore.

### Размещение в engine (черновик)

```text
engine/
  prefetch/
    prefetch-controller.ts    ← intent: match + fan-out + abort + queue
    content-prefetch.ts       ← branch → RouteContentLoader.preload()
  data-graph/
    data-graph.ts             ← load(), prefetch(), invalidate()
```

- `ProcessorPipeline.runLoads` → `dataGraph.load()` — **только navigation**, не prefetch.
- `PrefetchController` → вызывает **оба** sibling на intent.

### Ответ на вопрос «внутри или отдельно»

| Вопрос | Ответ |
|--------|--------|
| DataGraph внутри link-driven content? | **Нет** |
| Полностью отдельный модуль? | **Да** — свой API, store, политики |
| Как стыкуются? | **PrefetchController**: один match → **параллельно** content + data |
| На navigation? | **Разные фазы pipeline**: guards → `DataGraph.load` → content render |

---

## API (целевое)

### Router

```typescript
interface AuraRouter {
  /** Ручной prefetch — тесты, analytics, programmatic */
  preload(href: string, options?: PreloadOptions): Promise<void>;

  configure(options: {
    viewCache?: CacheStoreOptions;
    dataCache?: DataGraphOptions;
    domCache?: CacheStoreOptions;
    defaultPrefetch?: PrefetchMode;
    defaultPrefetchDelay?: number;
    preloadStaleTime?: number;
  }): void;
}

type PreloadOptions = {
  signal?: AbortSignal;
  /** true → loader получает preload flag (урезанная работа) */
  mode?: 'intent' | 'viewport' | 'manual';
};
```

### Engine

```typescript
// внутренний контракт
prefetchIntent(href: string, options: PreloadOptions): Promise<void>
```

### Route / ContentResolver

```typescript
// preload с реальным MatchedRouteInfo — не синтетика из attr
content.preload(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void>

// LoadContext.route.pattern — resolved из matcher (уже так на resolve)
```

### Deprecate

| Было | Станет |
|------|--------|
| `<aura-route preload>` | `data-prefetch` на ссылках или router default |
| `route.preload` в `connectedCallback` | убрать / no-op + dev warning |
| `ViewPayloadCache` on router | `ViewGraph` + `configure({ viewCache })` |

---

## Политики для edge cases

### Param routes (`/users/:id`)

Prefetch только с **конкретным href** из ссылки. Без ссылки — не prefetch.

### Catch-all (`path="*"`)

Prefetch по href; matcher решает, попадает ли в catch-all.

### Index (`path=""`)

`pattern` = parent pattern; pathname из href.

### Static layout-only (без content)

Пропуск — нет `ContentDescriptor`.

### Same-route / already active

Skip prefetch если `href` === current location и cache fresh.

### `saveData` / reduced motion

Пропуск prefetch при `navigator.connection?.saveData` (как SvelteKit).

---

## Очередь и приоритеты (фаза 2)

Как Next.js link queue:

1. links in viewport  
2. links with user intent (hover)  
3. newer intent replaces older  
4. discard off-screen pending  

MVP: без очереди — простой dedupe + abort previous on new hover.

---

## Миграция

| Этап | Действие |
|------|----------|
| 1 | `DataCache` per-router; DI в `RouteContentLoader` |
| 2 | `PrefetchController` + intent listeners на `linksSelector` |
| 3 | `engine.prefetchIntent(href)` → match → parallel branch preload |
| 4 | prefetch **пишет** в cache (static); `resolve` promotion |
| 5 | `preloadStaleTime`, GC |
| 6 | deprecate `<aura-route preload>`; документация + codemod hint |
| 7 | DataGraph prefetch в `PrefetchController` (sibling, не внутри content) — см. §Координация с DataGraph |
| 8 | `viewport` mode, per-link `data-prefetch` |

---

## Тест-план (чеклист)

- [ ] hover `[data-router-link]` → один fetch, второй hover → dedupe
- [ ] click после prefetch → `resolve` без второго fetch (fresh)
- [ ] nested `/settings/profile` → ключ по full pathname, не segment
- [ ] param `/users/1` vs `/users/2` → разные ключи
- [ ] mouseleave → abort in-flight
- [ ] `preloadStaleTime` expired → revalidate on navigation
- [ ] `data-prefetch="false"` → no prefetch
- [ ] два router на странице → изолированные cache instances
- [ ] intent → `Promise.all` content + DataGraph; mouseleave abort обоих
- [ ] click после data prefetch → `dataGraph.load()` cache hit
- [x] redirect из `load` **не поддерживается** (guard-only); prefetch кэширует payload как navigation

---

## Сравнение с индустрией

| | TanStack Router | SvelteKit | Aura (цель) |
|--|-----------------|-----------|-------------|
| Триггер | Link intent / viewport | `data-sveltekit-preload-data` | `[data-router-link]` + intent |
| Центр | `router.preloadRoute({ to })` | `preloadData(href)` | `router.preload(href)` |
| Per-route | `loader` | `load` | `ContentResolver` / attrs |
| Cache | router staleTime | client cache | `DataCache` per router |
| Branch | match chain parallel | по route | match chain parallel |

**Развёрнутая оценка (2026-06-27 00:31):** [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) — **6.5/10** overall. Стратегия next gen: [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md).

---

## Связь с существующими TODO

| Документ | Связь |
|----------|-------|
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | TTL, `preloadStaleTime`, dedupe — реализуются в router-owned cache |
| [CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) | resolver остаётся; меняется **кто** вызывает `preload` и **какой** cache |
| [DATAGRAPH.md](./DATAGRAPH.md) | sibling-исполнитель prefetch data; общий `PrefetchController` — §Координация с DataGraph |
| [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) | события `prefetch:start/hit/miss` с router scope |

---

## Итог

**Принятая стратегия:** link-driven prefetch orchestrated by `AuraRoutingEngine`, Data cache owned by `AuraRouter` instance. Route element — декларация loader/ref, не точка входа prefetch. DataGraph — **параллельный sibling** на том же intent, не внутри content-слоя.

Attr `preload` на `<aura-route>` — legacy; целевой UX — hover/focus на `[data-router-link]` + `router.preload(href)`.

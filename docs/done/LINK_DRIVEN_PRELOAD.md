# TODO: Link-driven preload + router-owned data cache

> **Статус:** <span style="color: #2ea043; font-weight: bold;">✓ CORE РЕАЛИЗОВАН</span> (2026-07) — см. [../PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md)  
> **Осталось:** viewport DOM source · prefetch queue (фаза 2) · часть product-тестов  
> **Связь:** [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) · [DATAGRAPH.md](./DATAGRAPH.md)  
> **Контекст:** решение по prefetch content-слоя для `aura-route-2` (2026-06); заменяет route-driven `preload` attr как основную модель.

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | уже есть в production path |
| <span style="color: #d97706; font-weight: bold;">~ ЧАСТИЧНО</span> | есть каркас / mode, не до конца |
| <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | не сделано |
| ⚠️ | временный / legacy |
| 🎯 | целевое поведение (исторический дизайн) |

---

## Сводка реализации

| Область | Статус | Код |
|---------|--------|-----|
| Link intent (hover / focus / touch) | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | `user-actions/link-prefetch-intent.ts` |
| Cancel on leave + AbortSignal | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | tracker + `PrefetchRunStore` |
| `PrefetchPipeline` (оркестратор) | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | `prefetch/pipeline.ts` (вместо черновика `PrefetchController`) |
| `router.prefetch` / `preload` | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | `aura-router.ts` → engine |
| Match → plan → speculative prepare | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | `plan.ts` + probe tx |
| View + Data sibling fan-out | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | `runSpeculativePrepare` → ViewGraph / DataGraph |
| Router-owned caches | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | instance `ViewGraph` + `DataGraph` |
| `data-prefetch` cascade | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | link → route → router |
| `staleTime` / dedupe / Save-Data | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | `PrefetchPolicy` + store |
| Mode `viewport` в типах / policy | <span style="color: #d97706; font-weight: bold;">~ ЧАСТИЧНО</span> | mode есть; **IntersectionObserver не подключён** |
| Prefetch queue / приоритеты | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | фаза 2 |
| Attr `<aura-route preload>` | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> | убран из production path; заменён на `prefetch` |

---

## TL;DR

**Link-driven** — prefetch запускается роутером по **намерению перейти на конкретный `href`** (hover / touch / viewport / API), а не при `connectedCallback` `<aura-route>`.

**Router-owned cache** — instance `ViewGraph` + `DataGraph` на `<aura-router>` / engine: dedupe, TTL, общий для prefetch и navigation.

Per-route объявляет **что** грузить (`view`, `load`, loader). Router решает **когда**, **для какого URL** и **куда положить результат**.

---

## Почему не route-driven `preload` attr

Раньше (`⚠️` legacy, **снято**):

```html
<aura-route path="profile" preload>
```

→ `connectedCallback` → синтетический `routeInfo` из attr `path` → preload без целевого URL.

| Проблема | Детали |
|----------|--------|
| Нет целевого URL | Для `:id` неизвестно `/users/1` vs `/users/2` |
| Nested без resolved pattern | attr `profile` ≠ pattern `/settings/profile` |
| Timing | route connect раньше `router.refreshRoutes()` / route tree |
| Лишний трафик | грузим routes, куда пользователь может не пойти |
| Cache mismatch | даже при записи в cache ключ не совпадал бы с navigation |

**Решение (принято и в коде):** attr `preload` на route — **не основная модель**. Целевая — link-driven + router cache (как TanStack Router, SvelteKit, React Router). Сейчас: `data-prefetch` / route `prefetch` / `router.prefetch(href)`.

---

## Термины

| Термин | Значение |
|--------|----------|
| **Prefetch / preload** | загрузка content (и опционально data) **до** commit navigation |
| **Intent** | сигнал «скорее всего перейдём»: hover, focus, touchstart, viewport |
| **Match chain** | ветка route tree для href: `[settings, profile]` |
| **View cache** | HTML string / payload loaders; ключ `viewCacheKey` (`ViewGraph`) |
| **DOM cache** | keep-alive DOM (`RouteDomCache`) — **отдельно**, не этот документ |
| **DataGraph** | кэш `load` hooks (JSON) — **отдельно**, координация в [DATAGRAPH.md](./DATAGRAPH.md) |

---

## Целевая архитектура

> Имена в диаграмме ниже — **дизайн 2026-06**. В коде: `PrefetchPipeline` + `runSpeculativePrepare`, кэш view — `ViewGraph` (не `DataCache` / `ContentPrefetch`). Актуальный поток: [PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md).

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
│  · match href → PrefetchPlan                                │
│  · PrefetchPipeline (debounce, staleTime, abort)            │
│  · ViewGraph + DataGraph (router-owned)                     │
│  · router.preload(href) / router.prefetch(href) API         │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ViewGraph            DataGraph        RouteDomCache
   (per-route WHAT)     (load hooks)     (keep-alive DOM)
```

---

## Link-driven: триггеры

### Default policy (как TanStack / SvelteKit)

| Режим | Событие | Задержка | Приоритет | Статус |
|-------|---------|----------|-----------|--------|
| `intent` (default) | `mouseover`, `focusin`, `touchstart` | ~50ms | высокий | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |
| `viewport` | IntersectionObserver на ссылке | — | средний | <span style="color: #d97706; font-weight: bold;">~ mode есть, source ✗</span> |
| `tap` | `touchstart` / высокая confidence | 0 | выше intent на mobile | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |
| `none` | — | — | отключено | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |

Per-link override:

```html
<a href="/users/42" data-router-link data-prefetch="intent">Alice</a>
<a href="/admin" data-router-link data-prefetch="false">Admin</a>
```

Router-level default:

```typescript
// AuraRouter.configure / attr prefetch
defaultMode: 'intent' | 'viewport' | 'tap' | 'none'  // ENGINE_DEFAULTS.prefetch
intentDelayMs: 50
staleTimeMs: 30_000
```

### Уже есть

- <span style="color: #2ea043; font-weight: bold;">✓</span> `[data-router-link]` — перехват **click** (`link-navigation` / history)
- <span style="color: #2ea043; font-weight: bold;">✓</span> `linksSelector` на `<aura-router>`
- <span style="color: #2ea043; font-weight: bold;">✓</span> `AuraRoutingUrlMatcher.matchPath` + `MatchedRouteInfo` с resolved `pattern`
- <span style="color: #2ea043; font-weight: bold;">✓</span> слушатели intent на том же selector (`LinkPrefetchIntentTracker`)
- <span style="color: #2ea043; font-weight: bold;">✓</span> `engine.prefetch(href)` / pipeline — **без** history commit
- <span style="color: #2ea043; font-weight: bold;">✓</span> отмена in-flight prefetch при leave / новом intent (`AbortSignal` + `cancelIntent`)

### Осталось

- <span style="color: #cf222e; font-weight: bold;">✗</span> `ViewportIntentSource` (`IntersectionObserver`) → bus
- <span style="color: #cf222e; font-weight: bold;">✗</span> очередь приоритетов (viewport &lt; hover &lt; tap) — фаза 2

---

## Router-owned cache

### Принципы

1. <span style="color: #2ea043; font-weight: bold;">✓</span> **Один cache-слой на router instance** — `ViewGraph` / `DataGraph`, не module-global singleton.
2. <span style="color: #2ea043; font-weight: bold;">✓</span> **Один ключ для prefetch и navigation** — `viewCacheKey(descriptor, routeInfo)`:
   - base: `routeInfo.pathname` (конкретный URL с params)
   - fallback: `routeInfo.pattern` (только если pathname нет)
3. <span style="color: #2ea043; font-weight: bold;">✓</span> **In-flight dedupe** — два hover на `/users/42` → один fetch (`AuraResolvableCache` / `PrefetchRunStore`).
4. <span style="color: #2ea043; font-weight: bold;">✓</span> **Promotion** — prefetch hit при click → navigation prepare / render без повторного fetch (если fresh).
5. <span style="color: #2ea043; font-weight: bold;">✓</span> **TTL** — `staleTimeMs` ≈ 30s в prefetch policy; Graph stores — через `configure({ viewCache / dataCache })`.

### Ключ кэша (актуальный код)

```typescript
// view-graph/cache/cache-key.ts
const base = routeInfo.pathname ?? routeInfo.pattern;
// + query + loader:content
```

Для param routes prefetch **всегда** с конкретным `pathname` из `href` ссылки — не с pattern alone.

### Что кэшируется

| Payload | Prefetch write | Примечание |
|---------|----------------|------------|
| `string` (html, template) | <span style="color: #2ea043; font-weight: bold;">✓</span> | `ViewGraph` / ViewPayloadCache |
| `DocumentFragment` | <span style="color: #cf222e; font-weight: bold;">✗</span> | DOM move semantics |
| dynamic import (component) | <span style="color: #d97706; font-weight: bold;">~</span> | chunk warm через view loaders; отдельно от HTML |

---

## Поток: один prefetch запрос

```text
hover href="/settings/profile?q=1"

1. resolveDocumentHref / normalize → pathname, search, hash
2. PrefetchPlanResolver → leaf + chain + enterRoutes (LCA)
3. planner → { data, view } flags по confidence
4. runSpeculativePrepare → dataGraph.prefetch + viewGraph.prefetchBranch
5. caches: dedupe по ключу per route + descriptor
```

**Параллельность:** data ∥ view по flags — **параллельно** в soft prepare.  
**Не batch всех routes приложения** — только `enterRoutes` **одного целевого href**.

---

## Координация с DataGraph

DataGraph — **отдельный параллельный блок (sibling)**, не внутри content preload. Общий оркестратор intent — `PrefetchPipeline`.

### Модель: один триггер, два sibling-слоя

```text
hover /users/42
        │
        ▼
┌───────────────────────────────────┐
│  PrefetchPipeline (engine)        │  ← общая «крышка»
│  · parse / normalize href         │
│  · PrefetchPlanResolver           │
│  · AbortSignal per intent         │
└───────────────┬───────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌───────────────────┐
│ ViewGraph     │ │ DataGraph.prefetch│  ← параллельно (soft prepare)
│ prefetchBranch│ │ (load hooks)      │
│ ViewPayload…  │ │ DataGraph store   │  ← разные cache namespace
└───────────────┘ └───────────────────┘
```

| | View prefetch | `DataGraph.prefetch()` | Статус |
|--|---------------|------------------------|--------|
| **Исполнитель** | `ViewGraph.prefetchBranch` | `load` hooks через graph | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **Payload** | HTML, template, WC string | JSON, объекты, store | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **Guards** | не вызываются | не вызываются | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **Ошибка** | тихо (soft prepare) | тихо | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **Cache** | ViewGraph | DataGraph store | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **TTL на prefetch** | `staleTimeMs` + graph opts | `staleTime` (~30s) | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **Abort обоих** | общий `signal` + `probe.cancel()` | то же | <span style="color: #2ea043; font-weight: bold;">✓</span> |

### На navigation (click)

Prefetch **не заменяет** navigation path — только прогревает cache.

```text
click /users/42

1. runGuards           enter / leave
2. runLoads            dataGraph.load()
3. runRender           viewGraph / resolve → cache hit после prefetch
4. runAfterRender      left / entered
```

### Размещение в engine (факт)

```text
engine/
  user-actions/
    link-prefetch-intent.ts   ← DOM intent
  prefetch/
    pipeline.ts               ← intent → plan → speculative prepare
    plan.ts / policy.ts / store.ts / resources.ts
    intent/bus.ts + link-source.ts
  view-graph/
  data-graph/
```

| Вопрос | Ответ |
|--------|--------|
| DataGraph внутри link-driven content? | **Нет** |
| Полностью отдельный модуль? | **Да** — свой API, store, политики |
| Как стыкуются? | **PrefetchPipeline**: один match → **параллельно** view + data |
| На navigation? | **Разные фазы pipeline**: guards → `DataGraph.load` → view render |

---

## API

### Router — <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span>

```typescript
interface AuraRouter {
  prefetch(href: string, options?: PrefetchOptions): Promise<void>;
  preload(href: string, options?: PrefetchOptions): Promise<void>; // alias → prefetch

  configure(options: {
    viewCache?: CacheStoreOptions;
    dataCache?: DataGraphOptions;
    domCache?: CacheStoreOptions;
    // prefetch defaults — ENGINE_DEFAULTS.prefetch / attr
  }): void;
}
```

### Engine — <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span>

```typescript
engine.prefetch(href, options?)           // без history commit
pipeline.scheduleIntent(href, mode?)
pipeline.cancelIntent(href?)
```

### Deprecate

| Было | Стало | Статус |
|------|-------|--------|
| `<aura-route preload>` | `data-prefetch` / route `prefetch` / router default | <span style="color: #2ea043; font-weight: bold;">✓</span> убран |
| `route.preload` в `connectedCallback` | intent + API | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| `ViewPayloadCache` naming в доках как DataCache | `ViewGraph` + `configure({ viewCache })` | <span style="color: #2ea043; font-weight: bold;">✓</span> в коде |

---

## Политики для edge cases

| Case | Статус |
|------|--------|
| Param routes — prefetch только с конкретным href | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| Catch-all / index — matcher + pathname | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| Layout-only без view targets — skip / no-targets | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| Same-route + fresh cache — skip | <span style="color: #2ea043; font-weight: bold;">✓</span> (`staleTimeMs`) |
| `navigator.connection?.saveData` | <span style="color: #2ea043; font-weight: bold;">✓</span> |

---

## Очередь и приоритеты (фаза 2)

Как Next.js link queue:

1. links in viewport  
2. links with user intent (hover)  
3. newer intent replaces older  
4. discard off-screen pending  

<span style="color: #2ea043; font-weight: bold;">✓ MVP:</span> без очереди — dedupe + abort previous on new hover / leave.  
<span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ:</span> полноценная priority queue.

---

## Миграция

| Этап | Действие | Статус |
|------|----------|--------|
| 1 | Cache per-router; DI в view loader path | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> (`ViewGraph`) |
| 2 | Оркестратор + intent listeners на `linksSelector` | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> (`PrefetchPipeline`) |
| 3 | `engine.prefetch(href)` → match → parallel branch | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |
| 4 | prefetch **пишет** в cache; resolve promotion | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |
| 5 | `staleTimeMs`, GC | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |
| 6 | deprecate `<aura-route preload>` | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |
| 7 | DataGraph prefetch sibling | <span style="color: #2ea043; font-weight: bold;">✓ ГОТОВО</span> |
| 8 | `viewport` mode + per-link `data-prefetch` | <span style="color: #d97706; font-weight: bold;">~</span> `data-prefetch` ✓ · viewport source ✗ |

---

## Тест-план (чеклист)

- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> hover / intent → fetch; второй → dedupe (`prefetch-pipeline.test.ts`)
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> click / nav после prefetch → cache warm (`engine-prefetch-wiring`, integration)
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> nested path → plan по full href (`prefetch-pipeline`, plan tests)
- [ ] <span style="color: #d97706; font-weight: bold;">~</span> param `/users/1` vs `/users/2` → разные ключи (ключ через pathname есть; явного product-теста мало)
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> leave → abort in-flight (`link-prefetch-intent`, pipeline cancel)
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> `staleTime` → skip repeat prefetch (`skips repeat prefetch within staleTime`)
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> `data-prefetch="false"` → no prefetch
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> intent → data ± view по confidence; abort обоих через signal
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> redirect из `load` **не на prefetch path** (guard-only / soft)
- [ ] <span style="color: #cf222e; font-weight: bold;">✗</span> два router на странице → изолированные cache (ожидаемо по DI; явного e2e нет)
- [ ] <span style="color: #cf222e; font-weight: bold;">✗</span> viewport links prefetch без hover

Покрытие файлами: см. [PREFETCH_ARCHITECTURE.md §Тесты](../PREFETCH_ARCHITECTURE.md#тесты).

---

## Сравнение с индустрией

| | TanStack Router | SvelteKit | Aura (**сейчас**) |
|--|-----------------|-----------|-------------------|
| Триггер | Link intent / viewport | `data-sveltekit-preload-data` | `[data-router-link]` + intent · viewport source TBD |
| Центр | `router.preloadRoute({ to })` | `preloadData(href)` | `router.prefetch(href)` |
| Per-route | `loader` | `load` | ViewGraph / DataGraph attrs |
| Cache | router staleTime | client cache | ViewGraph + DataGraph per router |
| Branch | match chain parallel | по route | `enterRoutes` via speculative prepare |

**Развёрнутая оценка (2026-06-27):** [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md). Стратегия next gen: [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md). Mode policy: [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md).

---

## Связь с существующими TODO

| Документ | Связь |
|----------|-------|
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | TTL, dedupe — `ViewGraph` / ViewPayloadCache |
| [CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) | исторический resolver; production path — ViewGraph |
| [DATAGRAPH.md](./DATAGRAPH.md) | sibling-исполнитель prefetch data |
| [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) | события `prefetch:*` с router scope |
| [PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md) | **актуальная** архитектура в коде |

---

## Итог

<span style="color: #2ea043; font-weight: bold;">✓ Принятая стратегия реализована в core:</span> link-driven prefetch через `PrefetchPipeline` + speculative prepare; caches owned by router (`ViewGraph` + `DataGraph`). Route element — декларация view/load, не точка входа prefetch.

**Открыто:** `ViewportIntentSource`, priority queue (фаза 2), часть product-тестов (params keys, multi-router isolation).

Attr `preload` на `<aura-route>` — legacy, снят; UX — hover/focus на `[data-router-link]` + `router.prefetch(href)`.

# Content resolver — поток route → loaders, реализация и статус

> **Статус:** реализовано в `aura-route-2/core/loader/` (2026-06)  
> **Связь:** [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) · [DATAGRAPH.md](./DATAGRAPH.md) · [VIEW_LAYER_ARCHITECTURE.md](./VIEW_LAYER_ARCHITECTURE.md)  
> **Контекст:** greenfield content-слой для v2; **не** использует `aura-content-loaders` (v1).

### Легенда

| Метка | Значение |
|-------|----------|
| ✅ | сделано в `aura-route-2` |
| ⚠️ | частично / с ограничениями |
| ❌ | не сделано |
| 🔧 | исправлено по аудиту |

---

## Сводка

| Область | Статус |
|---------|--------|
| `core/loader/` — resolver, cache, registry, loaders | ✅ |
| Единый путь layout + content через resolver | ✅ |
| `RouteContentLoader` — thin adapter | ✅ |
| In-flight dedupe | ✅ |
| View loader cache (`preserve="view"`) | ✅ per-router `DataCache`, LRU, string-only |
| Load hook cache (`preserve="data"`) | ✅ DataGraph SWR |
| `preload` | ✅ ⚠️ network warm-up, без записи в cache |
| Abort → `null` | ✅ |
| Зависимость от `aura-content-loaders` | ❌ убрана (v2 only) |
| Content loader plugins | ❌ |
| Router `registerLoader` / DI | ❌ |
| TTL / LRU data cache | ✅ `AuraRouter.configure({ dataCache: { max, gcTime } })` |
| Renaming attrs (`data-loader`) | ❌ |

**Тесты:** `aura-route-2/test/loader/` + интеграционные view-тесты — **57** тестов в модуле.

---

## Карта модулей (актуально)

| Модуль | Роль |
|--------|------|
| `core/aura-route.ts` | wiring: `new RouteContentLoader(this)` |
| `core/route-content-loader.ts` | thin adapter → `ContentResolver` |
| `core/loader/descriptor.ts` | route attrs → `ContentDescriptor` |
| `core/loader/content-resolver.ts` | resolve / preload, cache, registry |
| `core/content/cache/data-cache.ts` | in-memory cache + in-flight dedupe |
| `core/content/cache/data-key.ts` | ключ data cache |
| `core/loader/registry.ts` | `LoaderRegistry` + builtins |
| `core/loader/loaders.ts` | template, html, html-src, component, component-src |
| `core/loader/http.ts` | `fetchText`, `resolveRelativeUrl` |
| `core/loader/types.ts` | `ContentDescriptor`, `ResolveContext`, `LoaderFn` |
| `core/view/view-controller.ts` | `content.resolve()` → `applyMount` |
| `core/view/view-cache.ts` | ViewCache (keep-alive DOM) — **отдельно** |

**v1 (без изменений):** `aura-content-loaders` + `configureRouteContentLoader` на `AuraRouter`.

---

## Текущий поток (v2)

```mermaid
sequenceDiagram
  participant Engine
  participant Route as AuraRoute2
  participant VC as RouteViewController
  participant RCL as RouteContentLoader
  participant CR as ContentResolver
  participant Cache as DataCache
  participant Reg as LoaderRegistry
  participant Loader as loaders.ts

  Engine->>Route: render(routeInfo, { parentSignal })
  Route->>VC: render() → renderPass

  alt ViewCache hit (keepAlive)
    VC->>VC: tryCacheRestore → applyMount
  else resolve
  VC->>RCL: resolve(routeInfo, signal)
  RCL->>RCL: contentDescriptor(route)
  RCL->>CR: resolve(desc, ctx)
  opt descriptor.cache
    CR->>Cache: resolve(key, fetch)
    Cache-->>CR: hit / dedupe / fetch
  else no cache
    CR->>Reg: get(loader)
    Reg->>Loader: load(ctx)
    Loader-->>CR: string | DocumentFragment
  end
  CR-->>VC: payload | null
  VC->>VC: applyMount → outlet
  end
```

**Wiring:**

```typescript
content: new RouteContentLoader(this),
```

---

## Три кэша (не смешивать)

| Кэш | Где | Что хранит | Attr |
|-----|-----|------------|------|
| **ViewCache** | `view/view-cache.ts` | detached DOM | `preserve` / `preserve="view"` |
| **DataCache** | `content/cache/data-cache.ts` | string HTML from view loaders | `preserve` / `preserve="view"` |
| **DataGraph** | `data-graph/` | JSON из `load` hooks | `preserve="data"` |

Ключи разные: `cacheKey()` (view) vs `dataCacheKey()` (content).

---

## Реализовано по greenfield-плану

- [x] **`ContentResolver`** в `aura-route-2/core/loader/`
- [x] **`RouteContentLoader`** — thin adapter (~40 строк)
- [x] **Layout через `template` loader** — один путь в controller (`content.resolve`)
- [x] **Abort → `null`**
- [x] **`preload`** через resolver (см. ограничения ниже)
- [x] **In-flight dedupe**
- [x] **`preserve="view"`** → view-loader cache → `DataCache`
- [x] **`preserve="data"`** → `load` hooks → DataGraph
- [x] **Registry** без `new` на каждый resolve (функции в `loaders.ts`)
- [ ] Router: `configureContentResolver` / `registerLoader` на `AuraRoute2`
- [ ] Content loader plugins (`beforeLoad` / `afterLoad`)
- [ ] TTL / LRU / `max` на `DataCache`
- [ ] Переименование attrs (`data-loader`, `data-content`)
- [ ] Согласование с [CONTENT_CACHE.md](./CONTENT_CACHE.md) (полный API prefetch intent)

---

## Аудит (2026-06) — что верно

1. **Разделение слоёв** — view монтирует, loader только резолвит payload.
2. **`descriptor`** — layout (`template` + `layout` ref) vs content (`source` + `content` ref).
3. **Stale / abort** — resolver → `null`; controller проверяет `stale(pass)` после await.
4. **Layout `cache: false`** — template каждый раз `cloneNode` через `getTemplate`.
5. **View restore** — без `onPassStart` plugins (как в view-слое).

---

## Аудит — исправленные дыры 🔧

### 1. Кэш `DocumentFragment`

**Проблема:** fragment при повторном mount опустошается (DOM move semantics).  
**Fix:** `DataCache` кэширует только **`string`** payloads.  
**Тест:** `data-cache.test.ts` — `does not cache DocumentFragment payloads`.

### 2. `preload` и неверный cache key

**Проблема:** `preload` в `connectedCallback` использовал фейковый `routeInfo` (`/${route.path}`) → ключ не совпадал с render на nested/param URL.  
**Fix:** `preload` вызывает `fetch` **без записи в cache** — только network warm-up. Cache заполняется на `resolve`.  
**Тест:** `content-resolver.test.ts` — `preload warms network but does not write Data cache`.

---

## Аудит — оставшиеся ограничения

| # | Тема | Серьёзность | Детали |
|---|------|-------------|--------|
| 1 | **`defaultDataCache` global** | Средняя | Все `<aura-route-2>` делят один cache; нет eviction → рост памяти |
| 2 | **`preload` без реального `routeInfo`** | Средняя | Route attr `preload` — legacy; целевая модель: [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) |
| 3 | **`descriptor.kind` не используется** | Низкая | Дублирует `pass.viewKind`; можно валидировать или убрать |
| 4 | **Пустой `source`** | Низкая | `registry.get('')` → throw → error template (ок, но нет early validation) |
| 5 | **`resolveRelativeUrl`** | Низкая | Не обрабатывает absolute URL (`https://…`) — как v1 |
| 6 | **Нет `registerLoader` на router для v2** | Средняя | Расширение через `LoaderRegistry.register` в коде |
| 7 | **Nested content batch** | Низкая | Задача engine/view, не loader |

---

## `ContentDescriptor` (фактический API)

```typescript
type ContentDescriptor = {
  readonly kind: 'layout' | 'content';
  readonly loader: LoaderId;   // route.source или 'template'
  readonly ref: string;          // route.content или route.layout
  readonly cache: boolean;       // preserve.data (layout всегда false)
};
```

`contentDescriptor(route)` в `descriptor.ts`.

---

## Прагматичные следующие шаги

1. **Per-router `DataCache`** instance (или TTL) — убрать global leak.
2. **Link-driven preload** — см. [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md).
3. **`AuraRoute2.registerLoader`** — thin wrapper над `defaultLoaderRegistry`.
4. **Content plugins** — метрики / analytics без правки resolver.
5. **Документировать** в route README границу ViewCache / DataCache / DataGraph.

---

## Сравнение: v1 vs v2 content-слой

| Критерий | v1 `aura-content-loaders` | v2 `core/loader` |
|----------|---------------------------|------------------|
| Понятность | 6/10 — layout обходил loaders | 9/10 — один resolver |
| Производительность | 5/10 | 7/10 — cache + dedupe; нет TTL |
| Модульность | 6/10 — god-service, singleton | 8/10 — узкие файлы |
| Расширяемость | 7/10 — `registerLoader` на router | 7/10 — registry есть, router wiring нет |
| Переиспользование | shared с v1 | v2-only (намеренно) |

---

## Итог

Greenfield content-слой для **v2 реализован** в `aura-route-2/core/loader/`. Критичные дыры аудита (fragment cache, preload cache key) **закрыты**. Для production остаются: eviction/TTL, preload с реальным `routeInfo`, router-level DI для registry.

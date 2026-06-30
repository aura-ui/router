# TODO: кэш контента + prefetch (ContentLoader)

> **Статус:** content cache **в коде** (`DataCache` на router); **SWR для view** — TODO → [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md)  
> **Связь:** [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) · [P1-2](../comparison/FEATURE_PARITY_ROADMAP.md) · [FUTURE_PROOF_ENGINE.md §3](../FUTURE_PROOF_ENGINE.md) · [CACHE_STORE_COMPARISON.md](../comparison/CACHE_STORE_COMPARISON.md)  
> **Не путать с:** [DATAGRAPH.md](./DATAGRAPH.md) — кэш данных `load` hooks (JSON, store)

---

## Зачем

Content loaders (`source`, `data-content`: `html`, `html-src`, `component-src`, `template`) сейчас грузятся в **`render()`** без engine-level кэша и без prefetch по намерению (hover / viewport).

Отдельный **Data cache** — для:

- повторного визита без повторного fetch partial;
- prefetch разметки параллельно с DataGraph prefetch;
- быстрого commit в outlet при cache hit.

**DataGraph сюда не кладём** — другой тип payload и другой lifecycle (данные до render vs view в DOM).

---

## Граница: данные vs контент

| | **DataGraph** (`preserve="data"`) | **View loader cache** (`preserve="view"`, router `DataCache`) |
|--|---------------|-------------------|
| Источник | `load="…"` hooks | `view` / `html-src` / `template` / … |
| Payload | JSON, объекты | HTML string (view loaders) |
| Фаза | `runLoads` (pre-commit) | prefetch intent + `render` |
| Потребитель | hooks, `ctx.data`, логика | outlet / DOM |
| SWR | `staleTime`, `gcTime` (DataGraph) | `preloadStaleTime` prefetch only; **navigation SWR** — TODO |

```text
hover /users:
  dataGraph.prefetch([users])        // load hooks
  DataCache.prefetch(users)       // html-src partial

click /users:
  enter → dataGraph.load() → render → DataCache.get() или fetch
```

---

## Архитектура

### Отдельный кэш, общая инфра (опционально)

```text
┌─────────────────────────────────────────┐
│  CacheStore (shared infra, optional)    │
│  buildKey, dedupe in-flight, TTL, gc    │
└──────────────┬──────────────┬───────────┘
               │              │
        namespace:data   namespace:content
        (DataGraph)      (DataCache)
```

Для v1 content достаточно **простого** `Map<key, Entry>` + dedupe + `preloadStaleTime`.  
Не обязательно тянуть полный SWR day-1 — можно начать с TTL и расширить.

### Ключ кэша

Как у data (согласованность):

```text
content:{fullPath}:{serializedParams}:{serializedSearch}
```

Search входит в ключ (смена query → другой partial при необходимости).

---

## API (черновик)

```typescript
interface DataCacheEntry {
  payload: string | DocumentFragment;
  fetchedAt: number;
}

interface DataCache {
  get(key: string): DataCacheEntry | undefined;
  set(key: string, entry: DataCacheEntry): void;

  /** Навигация / render: blocking, ошибка → fail render */
  load(
    spec: ContentLoadSpec,
    options: { signal: AbortSignal; mode: 'blocking' },
  ): Promise<DataCacheEntry>;

  /** Hover / viewport: фон, ошибка тихо */
  prefetch(
    spec: ContentLoadSpec,
    options: { signal: AbortSignal; mode: 'intent' },
  ): Promise<void>;
}
```

`ContentLoadSpec` = route `source` + `content` + resolved URL context.

### Интеграция с loaders

```text
ContentLoaderRegistry.load(...):
  key = buildContentKey(route, match)
  hit = DataCache.get(key)
  if (hit && !isStale(hit, preloadStaleTime)) return hit.payload
  return fetch → DataCache.set(key, ...)
```

Prefetch вызывает тот же loader path с `mode: 'intent'` (без блокировки UI).

---

## Prefetch (P1-2)

| | Data prefetch | Content prefetch |
|--|---------------|------------------|
| Триггер | hover, focusin, IO, Speculation Rules | то же |
| Guards | нет | нет |
| Attr | `preload="intent"` на route | то же |
| TTL | `preloadStaleTime` (~30s) | то же |
| Store | DataGraph | DataCache |

Политика attr: `prefetch="none" | "intent" | "render"` — из roadmap.

На navigate guards **только** в pipeline; content берётся из кэша если свежий.

---

## Связь с outlet и render

```text
render(route):
  payload = DataCache.load(spec)   // или get + fallback fetch
  outlet.apply(payload, { strategy }) // replace | patch | stage
```

- **Patch (P0-5)** — на уровне outlet/renderer, не в DataCache.
- Cache отдаёт **payload**; outlet решает replace vs patch vs stage (анимация).

---

## Nested

| Сценарий | Data cache |
|----------|---------------|
| Sibling `/profile` → `/security` | prefetch/load только leaf partial; layout из template, не html-src |
| Cold enter | layout template (local) + prefetch child `html-src` |
| LCA reuse | layout DOM стабилен; кэш только для меняющегося leaf |

Layout (`layout="..."`) — обычно `<template id>`, не DataCache.  
Кэш — для **динамических** `html-src` / `component-src`.

---

## invalidate

```typescript
router.invalidate({ routes?, keys? })  // P1-3
```

Должен сбрасывать и **data**, и **content** ключи (или namespace) для затронутых маршрутов.

---

## Модуль (черновик)

```text
src/modules/aura-routing-engine/core/content/cache/
  data-cache.ts    # LRU + in-flight dedupe (DataCache)
  data-key.ts      # dataCacheKey(route, descriptor)
```

Интеграция: `ContentLoadService` принимает `DataCache` через DI; `AuraRouter.configure({ dataCache })` задаёт LRU-опции.

---

## Критерии готовности

- [ ] Ключ: fullPath + params + search
- [ ] `preloadStaleTime`, dedupe in-flight fetch
- [ ] `prefetch()` intent mode (фон, без throw в UI)
- [ ] `load()` в render с cache hit
- [ ] Общий prefetch триггер с DataGraph (href → match → оба warmup)
- [ ] `invalidate()` чистит content keys
- [ ] Тесты: hit, miss, stale, prefetch, abort signal

---

## Open questions

1. **Один CacheStore с DataGraph** — вынести key/TTL/dedupe в shared util или дублировать в v1?
2. **Кэш DocumentFragment vs string** — clone on get vs хранить string и парсить один раз?
3. **component-src** — кэш module namespace / custom element registry отдельно от HTML?
4. **`cache` attr на route** — связать с DataCache TTL или отдельная политика?

---

## Связанные документы

- [FEATURE_PARITY_ROADMAP.md §P1-2](../comparison/FEATURE_PARITY_ROADMAP.md)
- [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md)
- [INCREMENTAL_RENDER.md](../INCREMENTAL_RENDER.md)
- [DATAGRAPH.md](./DATAGRAPH.md)

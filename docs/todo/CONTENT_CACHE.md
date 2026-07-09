# Content cache + prefetch (view loaders)

> **Статус:** **реализовано (v1)** — `DataCache` на router, prefetch через общий pipeline. **Осталось:** params в ключе, `router.invalidate()` для content, SWR при navigation для view.  
> **Связь:** [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) · [P1-2](../comparison/FEATURE_PARITY_ROADMAP.md) · [FUTURE_PROOF_ENGINE.md §3](../FUTURE_PROOF_ENGINE.md) · [CACHE_STORE_COMPARISON.md](../comparison/CACHE_STORE_COMPARISON.md)  
> **Не путать с:** [DATAGRAPH.md](./DATAGRAPH.md) — кэш данных `load` hooks (JSON, store)

---

## Зачем

Content loaders (`view`: `html`, `html-src`, `component-src`; layout: `template`) грузятся через **`ContentLoadService`** — единая точка для prefetch (hover / tap / viewport) и render.

Router-level **`DataCache`** даёт:

- повторный визит без повторного fetch partial (при `preserve="view"`);
- prefetch разметки параллельно с DataGraph prefetch;
- быстрый commit в outlet при cache hit.

**DataGraph сюда не кладём** — другой тип payload и другой lifecycle (данные до render vs view в DOM).

---

## Граница: данные vs контент

| | **DataGraph** (`preserve="data"`) | **View loader cache** (`preserve="view"`, router `DataCache`) |
|--|---------------|-------------------|
| Источник | `load="…"` hooks | `view` / `html-src` / `template` / … |
| Payload | JSON, объекты | HTML **string** (view loaders) |
| Фаза | `runLoads` (pre-commit) | prefetch intent + `render` |
| Потребитель | hooks, `ctx.data`, логика | outlet / DOM |
| Store | `AuraCacheStore` в DataGraph | `AuraResolvableCache` в DataCache |
| SWR | `staleTime`, `gcTime` (DataGraph, default 30s) | dedupe + LRU; prefetch skip via `staleTimeMs` в prefetch policy; **navigation SWR для view — TODO** |

```text
hover /users:
  DataPrefetchExecutor → dataGraph.prefetch(...)   // load hooks
  ContentPrefetchExecutor → contentLoad.prefetchBranch(...)  // html-src partial → DataCache

click /users:
  enter → dataGraph.load() → render → contentLoad.resolve() → cache hit или fetch
```

---

## Реализация в коде

### Модуль

```text
src/modules/aura-routing-engine/core/content/
  cache/
    data-cache.ts       # DataCache — обёртка над AuraResolvableCache
    data-key.ts         # dataCacheKey(descriptor, routeInfo)
  content-load-service.ts   # render + prefetch orchestrator
  loaders/              # LoaderRegistry, builtins
```

Интеграция:

- `AuraRouter` создаёт `DataCache` и `ContentLoadService`, передаёт в `AuraRoutingEngine`.
- `AuraRouter.configure({ dataCache: { max, gcTime, staleTime? } })` — LRU / TTL / опциональный SWR на store.
- Кэш включается **только** при `preserve="view"` (или bare `preserve`) на route → `descriptor.cache === true`.

См. также `src/modules/aura-routing-engine/core/content/README.md`.

### Инфраструктура кэша

Оба store (DataGraph и DataCache) используют общий **`aura-cache-store`**:

```text
┌─────────────────────────────────────────┐
│  AuraCacheStore / AuraResolvableCache   │
│  LRU, in-flight dedupe (Singleflight),  │
│  gcTime, optional staleTime (SWR)       │
└──────────────┬──────────────┬───────────┘
               │              │
        DataGraph cache   DataCache (view strings)
```

По умолчанию `DataCache`: `max: 50`, `gcTime: Infinity`, без `staleTime`.

### Ключ кэша (`dataCacheKey`)

**Фактический формат:**

```text
{pathname}|{sortedQuery}|{loader}:{ref}
```

- `pathname` — resolved path; fallback на `pattern`, если pathname нет.
- `query` — sorted `key=value` pairs (search входит в ключ).
- `loader:content` — из `ContentDescriptor` (`html-src:pages/home.html`).

**Не входит в ключ (TODO):** dynamic **path params** (`:id`, `*`). Сейчас разные params при одном pathname могут коллизировать, если partial зависит от params.

Исходный черновик `content:{fullPath}:{params}:{search}` — не реализован; при доработке params сверить с data-key в DataGraph.

### API (как в коде)

`DataCache` — thin wrapper:

```typescript
class DataCache {
  get(key: string): ViewPayload | undefined;
  set(key: string, payload: ViewPayload): void;  // только string
  delete(key: string): void;
  clear(): void;
  resolve(key, load): Promise<ViewPayload | null>;  // hit + in-flight dedupe
}
```

Render и prefetch — **не** отдельные `load()` / `prefetch()` на `DataCache`, а **`ContentLoadService`**:

```typescript
class ContentLoadService {
  resolve(routeInfo, signal, options?): Promise<ViewPayload | null>;     // navigation / render
  prefetchNode(routeInfo, signal): Promise<void>;
  prefetchBranch(chain, signal, options?): Promise<void>;
  prefetchLeaf(leaf, signal, options?): Promise<void>;
}
```

Поток при `preserve="view"`:

```text
ContentLoadService.resolveDescriptor(...):
  if (!descriptor.cache) → runLoader()
  key = dataCacheKey(descriptor, routeInfo)
  return cache.resolve(key, runLoader)
```

- **Abort** → `null` (без throw).
- **Loader error** при navigation → `ContentLoadError`.
- **DocumentFragment** не кэшируется (только string payloads).

### Prefetch (P1-2)

| | Data prefetch | Content prefetch |
|--|---------------|------------------|
| Executor | `DataPrefetchExecutor` | `ContentPrefetchExecutor` |
| Триггер | hover, focusin, IO, tap | то же (общий prefetch pipeline) |
| Guards | нет на prefetch | нет |
| Attr | `prefetch` на route / router; `data-prefetch` на link | то же |
| Skip repeat | `PrefetchPolicy.staleTimeMs` (~30s default) | то же (на уровне plan, не entry TTL) |
| Store | DataGraph | DataCache (shared instance) |

На navigate guards только в pipeline; content берётся из кэша при hit.

---

## Связь с outlet и render

```text
render(route):
  payload = contentLoad.resolve(routeInfo, signal)
  outlet.apply(payload, { strategy })   // replace | patch | stage
```

- **Patch (P0-5)** — на уровне outlet/renderer, не в DataCache.
- Cache отдаёт **payload**; outlet решает replace vs patch vs stage (анимация).
- Отдельный **`RouteViewCache`** (`viewCache` в configure) — keep-alive **DOM** (`detachedRoot`), не путать с `DataCache` (string payloads).

---

## Nested

| Сценарий | Content cache |
|----------|---------------|
| Sibling `/profile` → `/security` | prefetch/load leaf partial; layout из `template`, не html-src |
| Cold enter | layout template (local) + prefetch child `html-src` |
| LCA reuse | layout DOM стабилен; кэш только для меняющегося leaf |

Layout (`layout="..."`) → descriptor `{ kind: 'layout', loader: 'template', cache: false }`.  
`DataCache` — для **динамических** `html-src` / `html` при `preserve="view"`.

---

## invalidate (TODO)

```typescript
router.invalidate({ routes?, keys? })  // P1-3
```

`AuraResolvableCache` уже поддерживает `invalidate` / `invalidateMatch` / `invalidateAll`, но:

- `DataCache` не пробрасывает invalidate наружу;
- `AuraRouter` / engine не вызывают invalidate для content keys при навигации или API.

DataGraph.invalidate* уже есть — content side нужно связать в том же `router.invalidate()`.

---

## Критерии готовности

> **Легенда:** <span style="color: #2ea043; font-weight: bold;">✓</span> готово · <span style="color: #cf222e; font-weight: bold;">✗</span> не сделано

- <span style="color: #2ea043; font-weight: bold;">✓</span> Engine-level cache для view loaders (`DataCache` + `ContentLoadService`)
- <span style="color: #2ea043; font-weight: bold;">✓</span> Ключ: pathname/pattern + query + loader:content
- <span style="color: #cf222e; font-weight: bold;">✗</span> Ключ: **path params** (`:id`, splat)
- <span style="color: #2ea043; font-weight: bold;">✓</span> In-flight dedupe (`AuraResolvableCache.resolve`)
- <span style="color: #2ea043; font-weight: bold;">✓</span> LRU (`max`), `gcTime` через `AuraRouter.configure({ dataCache })`)
- <span style="color: #2ea043; font-weight: bold;">✓</span> Prefetch intent (общий pipeline, `ContentPrefetchExecutor`)
- <span style="color: #2ea043; font-weight: bold;">✓</span> Cache hit на navigation render (`preserve="view"`)
- <span style="color: #2ea043; font-weight: bold;">✓</span> Общий prefetch триггер с DataGraph (href → match → data + content resources)
- <span style="color: #cf222e; font-weight: bold;">✗</span> `router.invalidate()` чистит content keys
- <span style="color: #cf222e; font-weight: bold;">✗</span> Navigation SWR для view (`staleTime` на DataCache + revalidate on navigate)
- <span style="color: #2ea043; font-weight: bold;">✓</span> Тесты: hit, miss, dedupe, LRU, prefetch+navigation shared key, query in key
- <span style="color: #cf222e; font-weight: bold;">✗</span> Тесты: stale/SWR для content, abort на prefetch, params in key

**Тесты:** `src/modules/aura-route/test/loader/data-cache.test.ts`, `data-key.test.ts`, `src/modules/aura-routing-engine/test/content/content-view-flow.test.ts`, prefetch wiring tests.

---

## Open questions

1. ~~**Один CacheStore с DataGraph**~~ — **решено v1:** общий `aura-cache-store`, отдельные инстансы.
2. ~~**DocumentFragment vs string**~~ — **решено:** кэшируем только `string`; fragment всегда fresh load.
3. **component-src** — кэш module namespace / custom element registry отдельно от HTML?
4. **`preserve` / per-route TTL** — связать attr route с `staleTime`/`gcTime` DataCache или только global configure?
5. **Params в ключе** — сериализация как в DataGraph или отдельный формат?

---

## Связанные документы

- [FEATURE_PARITY_ROADMAP.md §P1-2](../comparison/FEATURE_PARITY_ROADMAP.md)
- [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md)
- [INCREMENTAL_RENDER.md](../INCREMENTAL_RENDER.md)
- [DATAGRAPH.md](./DATAGRAPH.md)

# Content cache + prefetch (view loaders)

> **Статус:** <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО (v1)</span> — `ViewGraph` + `ViewPayloadCache` на router, prefetch через общий pipeline.  
> **Сверка с кодом:** 2026-07-19  
> **Осталось:** <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> parity params · <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗</span> единый `router.invalidate()` · <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗</span> navigation SWR default · <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> product-тесты  
> **Связь:** [../done/LINK_DRIVEN_PRELOAD.md](../done/LINK_DRIVEN_PRELOAD.md) · [P1-2](../comparison/FEATURE_PARITY_ROADMAP.md) · [FUTURE_PROOF_ENGINE.md §3](../FUTURE_PROOF_ENGINE.md) · [CACHE_STORE_COMPARISON.md](../comparison/CACHE_STORE_COMPARISON.md) · [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md)  
> **Не путать с:** [DATAGRAPH.md](./DATAGRAPH.md) — кэш данных `load` hooks (JSON, store)

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | каркас есть, не до конца |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> | сознательно не в scope |

### Сводка прогресса

| Блок | Статус | Что дальше |
|------|--------|------------|
| ViewGraph + ViewPayloadCache | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | закрыт |
| Prefetch (`ViewPrefetchExecutor`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | общий pipeline с DataGraph |
| Cache key (pathname/query/loader) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Path params в ключе | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | parity с `buildRouteDataKey` |
| `invalidateView()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Единый `router.invalidate()` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | scope content/data |
| Navigation SWR (view default) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | opt-in `viewCache.staleTime` уже есть |
| Тесты core | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | hit/miss/dedupe/invalidate/prefetch |
| Product / edge tests | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | SWR nav · `/users/1` vs `/users/2` |

---

## Зачем

View loaders (`view`: `html`, `url`, `import`, `component`; layout: `template`) грузятся через **`ViewGraph`** — единая точка для prefetch (hover / tap / viewport) и render.

Router-level **`ViewPayloadCache`** даёт:

- повторный визит без повторного fetch partial (при `cache="view"` / `cache="screen"`);
- prefetch разметки параллельно с DataGraph prefetch;
- быстрый commit в outlet при cache hit.

**DataGraph сюда не кладём** — другой тип payload и другой lifecycle (данные до render vs view в DOM).

---

## Граница: данные vs контент

| | **DataGraph** (`cache="data"`) | **View loader cache** (`cache="view"` / `screen`, `ViewPayloadCache`) |
|--|---------------|-------------------|
| Источник | `load="…"` hooks | `view` / `url` / `template` / … |
| Payload | JSON, объекты | HTML **string** (view loaders) |
| Фаза | `runLoads` (pre-commit) | prefetch intent + `render` |
| Потребитель | hooks, `ctx.data`, логика | outlet / DOM |
| Store | `AuraResolvableCache` в DataGraph | `AuraResolvableCache` в ViewPayloadCache |
| SWR | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `staleTime` + `gcTime` (default 30s) | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> dedupe + LRU; prefetch skip via `staleTimeMs`; **navigation SWR для view — не по умолчанию** |

```text
hover /users:
  DataPrefetchExecutor → dataGraph.prefetch(...)        // load hooks
  ViewPrefetchExecutor → viewGraph.prefetchBranch(...)  // url/html partial → ViewPayloadCache

click /users:
  enter → dataGraph.load() → render → viewGraph.loadView() → cache hit или fetch
```

---

## Реализация в коде

### Модуль

```text
src/modules/aura-routing-engine/core/view-graph/
  view-graph.ts              # loadView, prefetchBranch, invalidate
  cache/
    view-payload-cache.ts    # ViewPayloadCache — обёртка над AuraResolvableCache
    cache-key.ts             # viewCacheKey(descriptor, routeInfo)
  loaders/                   # LoaderRegistry, builtins (html, url, template, …)
  registry.ts
```

> **Legacy:** `core/content/` (`DataCache`, `ContentLoadService`) — черновик; в production path используется `view-graph/`. См. [view-graph/README.md](../../src/modules/aura-routing-engine/core/view-graph/README.md).

Интеграция:

- `AuraRouter` создаёт `ViewGraph` с `ViewPayloadCache`.
- `AuraRouter.configure({ viewCache: { max, gcTime, staleTime? } })` — LRU / TTL / опциональный SWR для loader strings.
- `AuraRouter.configure({ dataCache: { max, staleTime, gcTime } })` — load-hook store (`DataGraph`).
- `AuraRouter.configure({ domCache: { max, gcTime } })` — detached DOM (`RouteDomCache`).
- Кэш loader payload включается при `cache="view"` / `screen` / `all` → `descriptor.cache === true` (`cache.view`).

### Инфраструктура кэша

Оба store (DataGraph и ViewPayloadCache) используют общий **`aura-cache-store`**:

```text
┌─────────────────────────────────────────┐
│  AuraCacheStore / AuraResolvableCache   │
│  LRU, in-flight dedupe (Singleflight),  │
│  gcTime, optional staleTime (SWR)       │
└──────────────┬──────────────┬───────────┘
               │              │
        DataGraph cache   ViewPayloadCache (view strings)
```

По умолчанию `ViewPayloadCache`: `max: 50`, `gcTime: 12h`, **без `staleTime`**.  
SWR для view можно включить глобально: `AuraRouter.configure({ viewCache: { staleTime: 30_000 } })` — инфра в `AuraResolvableCache.resolve()` уже есть.

### Ключ кэша (`viewCacheKey`)

**Фактический формат:**

```text
{pathname | matchKey[+params]} | {query?} | d:{json(data)?} | {kind}:{loader}:{content} [:: {extract}]
```

- `pathname` — resolved path (типичный случай: params уже в pathname, напр. `/users/1` vs `/users/2`).
- без `pathname` — `routeMatchKey(pattern)` + sorted `key=value` params.
- `query` — sorted `key=value` pairs.
- `d:{json}` — опционально, когда loader получает `data` из load hooks.
- `{kind}:{loader}:{content}` — из `ViewDescriptor`; `::{extract}` для `url` + attr `extract`.

**Params:**

| Кейс | Статус |
|------|--------|
| разные `:id` при нормальной навигации → разные ключи через pathname | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| fallback `matchKey\|params` когда pathname отсутствует | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| явный сегмент path params при совпадении pathname (edge) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| parity формата с `buildRouteDataKey` (DataGraph) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

### API (как в коде)

`ViewPayloadCache` — thin wrapper:

```typescript
class ViewPayloadCache {
  get(key: string): ViewPayload | undefined;
  clear(): void;
  destroy(): void;
  resolve(key, load): Promise<ViewPayload | null>;  // hit + in-flight dedupe
  invalidate(options?: RouterInvalidateOptions): number;
}
```

Render и prefetch — на **`ViewGraph`**:

```typescript
class ViewGraph {
  loadView(routeInfo, signal, options?): Promise<ViewPayload | null>;
  loadPayload(descriptor, routeInfo, signal, data?): Promise<ViewPayload | null>;
  prefetchNode(routeInfo, signal): Promise<void>;
  prefetchBranch(chain, signal, options?): Promise<void>;
  prefetchLeaf(leaf, signal, options?): Promise<void>;
  invalidate(options?: RouterInvalidateOptions): number;
}
```

Поток при `cache.view === true`:

```text
ViewGraph.loadPayload(...):
  if (!descriptor.cache) → runLoader()
  key = viewCacheKey(descriptor, routeInfo, { data })
  return cache.resolve(key, runLoader)
```

- **Abort** → `null` (без throw).
- **Loader error** при navigation → `CONTENT_LOAD_FAILED` (`createViewLoadError`).
- **DocumentFragment** не кэшируется (только string payloads).

### Prefetch (P1-2)

| | Data prefetch | Content prefetch |
|--|---------------|------------------|
| Executor | `DataPrefetchExecutor` | `ViewPrefetchExecutor` |
| Триггер | hover, focusin, IO, tap | то же (общий prefetch pipeline) |
| Guards | нет на prefetch | нет |
| Attr | `prefetch` на route / router; `data-prefetch` на link | то же |
| Skip repeat | `PrefetchPolicy.staleTimeMs` (~30s default) | то же (на уровне plan, не entry TTL) |
| Store | DataGraph | ViewPayloadCache (shared instance на router) |

На navigate guards только в pipeline; content берётся из кэша при hit.

---

## Связь с outlet и render

```text
render(route):
  payload = viewGraph.loadView(routeInfo, signal, { data })
  outlet.apply(payload, { strategy })   // replace | patch | stage
```

- **Patch (P0-5)** — на уровне outlet/renderer, не в ViewPayloadCache.
- Cache отдаёт **payload**; outlet решает replace vs patch vs stage (анимация).
- Отдельный **`RouteDomCache`** (`domCache` в configure) — keep-alive **DOM** (`detachedRoot`), не путать с `ViewPayloadCache` (loader strings).

---

## Nested

| Сценарий | Content cache |
|----------|---------------|
| Sibling `/profile` → `/security` | prefetch/load leaf partial; layout из `template`, не url |
| Cold enter | layout template (local) + prefetch child `url` / `html` |
| LCA reuse | layout DOM стабилен; кэш только для меняющегося leaf |

Layout (`layout="..."`) → descriptor `{ kind: 'layout', loader: 'template', cache: false }`.  
`ViewPayloadCache` — для **динамических** `url` / `html` при `cache="view"` / `screen`.

---

## invalidate

**Сделано** <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> (отдельный API):

```typescript
router.invalidateView({ key?, path?, match?, policy?: 'stale' | 'remove' })
viewGraph.invalidate(options)  // тот же RouterInvalidateOptions
```

- Scope: `key`, `path`, `match`; policy `stale` (default) | `remove`.
- Общая логика: `invalidate-router-cache.ts` (симметрично `DataGraph.invalidate`).

**Не сделано** <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗</span>:

```typescript
router.invalidate({ content: true })  // или единый invalidate data + view
```

`router.invalidate()` сейчас чистит **только load-hook cache** (`invalidateData`); view cache не затрагивает — см. `invalidate.test.ts` («does not clear view-loader payload cache»).  
Цель parity: один DX после мутации, как в TanStack (`invalidate` + опционально content scope).

---

## Критерии готовности

> **Легенда:** <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> готово · <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> частично · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> не сделано

- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Engine-level cache для view loaders (`ViewGraph` + `ViewPayloadCache`)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Ключ: pathname/pattern + query + kind:loader:content (+ extract, + data)
- <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> Ключ: **path params** — через pathname и fallback `matchKey\|params`; edge cases + parity с DataGraph
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> In-flight dedupe (`AuraResolvableCache.resolve`)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> LRU (`max`), `gcTime` через `AuraRouter.configure({ viewCache })`
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Prefetch (общий pipeline, `ViewPrefetchExecutor`)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Cache hit на navigation render (`cache="view"` / `screen`)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Общий prefetch триггер с DataGraph (href → match → data + view resources)
- <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> Invalidate content — `invalidateView()` есть; нет в `router.invalidate()`
- <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Navigation SWR для view по умолчанию (`staleTime` + revalidate on navigate)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Тесты: hit, miss, dedupe, query in key, invalidate, prefetch wiring
- <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> Тесты: abort на prefetch (pipeline-level); нет view SWR и явного `/users/1` vs `/users/2` key test

**Тесты:**

| Область | Файлы |
|---------|-------|
| ViewGraph / cache | `test/view-graph/view-graph.test.ts`, `cache/view-payload-cache.test.ts`, `cache/cache-key.test.ts` |
| Invalidate router | `aura-router/test/invalidate.test.ts` |
| Prefetch wiring | `test/prefetch/engine-prefetch-wiring.test.ts`, `prefetch-pipeline.test.ts`, `resource-planner.test.ts` |
| Invalidate helper | `test/invalidate/invalidate-router-cache.test.ts` |

---

## Open questions

1. ~~**Один CacheStore с DataGraph**~~ — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> решено v1: общий `aura-cache-store`, отдельные инстансы.
2. ~~**DocumentFragment vs string**~~ — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> решено: кэшируем только `string`; fragment всегда fresh load.
3. **component-src** — кэш module namespace / custom element registry отдельно от HTML? <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>
4. **`cache` / per-route TTL** — связать attr route с `staleTime`/`gcTime` ViewPayloadCache или только global configure? <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>
5. **Params в ключе** — сериализация как в DataGraph (`buildRouteDataKey`) или оставить pathname-embedded? <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span>

---

## Связанные документы

- [FEATURE_PARITY_ROADMAP.md §P1-2](../comparison/FEATURE_PARITY_ROADMAP.md)
- [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md)
- [INCREMENTAL_RENDER.md](./INCREMENTAL_RENDER.md)
- [DATAGRAPH.md](./DATAGRAPH.md)
- [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md)

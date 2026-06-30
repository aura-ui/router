# DataGraph: кэш `load` hooks (SWR)

> **Статус:** **v1 реализован** в `src/modules/aura-routing-engine/core/data-graph/` (2026-06-30)  
> **Gaps по коду** (детально, зачем каждый пункт): [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md)  
> **Parity gaps** (effort, roadmap): [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md)  
> **Связь:** [P0-3](../comparison/FEATURE_PARITY_ROADMAP.md) · [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md)  
> **Не путать с:** Content `DataCache` — кэш view/HTML (`html-src`, loaders)

---

## Зачем

`load` hooks — данные для логики / props **до render** (не разметка outlet).

**DataGraph** — engine-слой для:

- оркестрации `load` hooks (один вызов на ветку, не `runLifecycleStep` per-route в цикле);
- кэша с **SWR** (`staleTime`, `gcTime`, фоновый revalidate);
- reuse на LCA (parent не в `enterRoutes` → snapshot из кэша);
- prefetch intent + `invalidate()`.

**Не заменяет:** `ContentLoadService` / `DataCache` — см. [CONTENT_CACHE.md](./CONTENT_CACHE.md).

---

## Граница ответственности

| Слой | Что | Когда |
|------|-----|-------|
| **Guards** (`enter` / `leave`) | можно ли войти / уйти | `runGuards`, blocking |
| **DataGraph** | данные `load` hooks | `runLoads`, после guards |
| **Content loaders** | HTML / WC / template | `render`, outlet |
| **Prefetch** | когда греть | link → route → router — [prefetch-policy.ts](../../src/modules/aura-routing-engine/core/prefetch/prefetch-policy.ts) |

```text
load hooks   = WHAT (fetch для логики)
DataGraph    = WHO/WHEN + cache + snapshot
Content      = HOW (view spec → DOM)
```

---

## Pipeline (актуально)

```text
reenter shortcut? → без полного load (см. parity: reenter policy — TODO)

иначе:
  1. runGuards       leave → enter
  2. runLoads        dataGraph.load(enterRoutes, { chain, runtime })
  3. runRender       outlet + content (ctx.data из snapshot)
  4. runAfter        left → entered
```

Код: `ProcessorPipeline.runLoads()` → `data-graph/data-graph.ts`.

### API

```typescript
dataGraph.load(
  targets: readonly MatchedRouteInfo[],
  options: { chain?: readonly MatchedRouteInfo[]; runtime: LifecycleRuntimeContext },
): Promise<DataGraphLoadResult>;  // { outcome, snapshot }

dataGraph.prefetch(targets, { signal, mode: 'intent' }): Promise<void>;

dataGraph.invalidate(key: string): void;
dataGraph.invalidateMatch(predicate): void;
dataGraph.invalidateAll(): void;
```

---

## SWR внутри `load()`

```text
для каждого target (parallel):
  key = buildRouteDataKey(route, hookNames)

  fresh   → cache hit, hook fetch пропускаем (onLoad route callback всё равно)
  stale   → отдать кэш + revalidate в фоне (AuraResolvableCache)
  missing → await load hook → cache.resolve

вернуть DataSnapshot (Map<key, data>)
```

Default: `staleTime: 30_000`, `gcTime: DEFAULT_GC_TIME` (5 min).

Подробнее про «зрелый» SWR-слой vs TanStack: **[DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md)**.

---

## Prefetch

Guards на prefetch **не вызываем**. `DataPrefetchExecutor` wired в `AuraRoutingEngine.initPrefetch()`.

```text
hover /users:
  PrefetchPipeline → ContentPrefetchExecutor + DataPrefetchExecutor
  dataGraph.prefetch(targets, { mode: 'intent' })

click /users:
  guards → dataGraph.load()   // cache hit / SWR возможен
```

| | `load()` | `prefetch()` |
|--|----------|--------------|
| Guards | да (снаружи) | нет |
| redirect из hook | fail navigation | игнор |
| ошибка | fail navigation | тихо |

---

## Модуль (факт)

```text
src/modules/aura-routing-engine/core/data-graph/
  data-graph.ts       load(), prefetch(), invalidate*
  route-data.ts       keys, routeHasLoadHooks
  index.ts

Тесты: test/data-graph/data-graph.test.ts
Store: aura-cache-store (AuraResolvableCache)
```

---

## Критерии готовности

### v1 — <span style="color:#16a34a">сделано</span>

- [x] Ключ: route + params + hook names (`buildRouteDataKey`)
- [x] `staleTime`, `gcTime`, stale-while-revalidate
- [x] Cache hit → skip hook fetch
- [x] LCA snapshot из кэша
- [x] `load()` / `prefetch()` — разная политика redirect/error
- [x] Parallel loads + sibling abort
- [x] Wired в `ProcessorPipeline` + prefetch executor
- [x] Тесты: hit, redirect, prefetch, invalidate, LCA snapshot

### Parity (TODO) — см. [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md)

- [ ] `shouldRevalidate` per route / navigation
- [ ] `staleTime` / `gcTime` per route
- [ ] `router.invalidate()` публичный фасад
- [ ] `cause: 'preload' | 'enter'` в hook context
- [ ] Reenter load policy
- [ ] Devtools / debug events
- [ ] SWR на content `DataCache` (отдельный track)

---

## Open questions

1. **Единый CacheStore namespace** с content — общая инфра, разные key prefix — см. [CONTENT_CACHE.md](./CONTENT_CACHE.md).
2. **`onLoad()` на route** — вызывается на каждой navigation, включая cache hit (by design).
3. Per-route **`preserve="data"`** — только routes с флагом пишут в DataGraph cache.

---

## Связанные документы

- [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) — что значит «зрелый data/SWR» и gap vs TanStack/RR7
- [CONTENT_CACHE.md](./CONTENT_CACHE.md)
- [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md)
- [../PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md)
- [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md)

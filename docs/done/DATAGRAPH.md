# DataGraph: кэш `load` hooks (SWR)

> **Статус:** <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО (v1)</span> — `core/data-graph/` · owner `ResourceGraph`  
> **Сверка с кодом:** 2026-07-19  
> **Gaps:** [DATAGRAPH_GAPS.md](../todo/DATAGRAPH_GAPS.md) · **Load DAG:** [DATAGRAPH_LOAD_DAG.md](../todo/DATAGRAPH_LOAD_DAG.md) · **Parity:** [DATA_SWR_PARITY.md](../todo/DATA_SWR_PARITY.md)  
> **Связь:** [P0-3](../comparison/FEATURE_PARITY_ROADMAP.md) · [../done/LINK_DRIVEN_PRELOAD.md](../done/LINK_DRIVEN_PRELOAD.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [../done/RESOURCE_GRAPH_HANDOFF.md](../done/RESOURCE_GRAPH_HANDOFF.md)  
> **Не путать с:** [CONTENT_CACHE.md](./CONTENT_CACHE.md) — `ViewPayloadCache` (view/HTML loaders)

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | каркас / opt-in есть |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> | сознательно не в scope |

### Сводка прогресса

| Блок | Статус | Что дальше |
|------|--------|------------|
| DataGraph v1 (load + SWR + prefetch mode) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | закрыт |
| LCA snapshot / `cache="data"` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Handoff (prefetch → nav) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | [RESOURCE_GRAPH_HANDOFF](../done/RESOURCE_GRAPH_HANDOFF.md) |
| `ctx.parent()` opt-in | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | parallel default — [LOAD_DAG](../todo/DATAGRAPH_LOAD_DAG.md) |
| `router.invalidate()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | unified data+view ✗ |
| Per-route TTL / `shouldRevalidate` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [DATA_SWR_PARITY](../todo/DATA_SWR_PARITY.md) |
| Parent→child load join | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | opt-in `parent()`; engine-forced DAG ⊘ |

---

## Зачем

`load` hooks — данные для логики / props **до render** (не разметка outlet).

**DataGraph** — engine-слой для:

- оркестрации `load` hooks (один batch на enter-ветку через `ResourceGraph.load`);
- кэша с **SWR** (`staleTime`, `gcTime`, фоновый revalidate);
- reuse на LCA (parent не в `enterRoutes` → snapshot из кэша);
- prefetch (`mode: 'prefetch'`) + `invalidate()`;
- opt-in `await ctx.parent()` для child → nearest ancestor payload.

**Не заменяет:** `ViewGraph` / `ViewPayloadCache` — см. [CONTENT_CACHE.md](./CONTENT_CACHE.md).

---

## Граница ответственности

| Слой | Что | Когда |
|------|-----|-------|
| **Guards** (`enter` / `leave`) | можно ли войти / уйти | `runGuards`, blocking |
| **DataGraph** | данные `load` hooks | `runLoads` → `ResourceGraph.load` → `dataGraph.load` |
| **ViewGraph** | HTML / WC / template | тот же `runLoads` (viewSnapshot) + render |
| **Prefetch** | когда греть | link → route → router — [policy.ts](../../src/modules/aura-routing-engine/core/prefetch/policy.ts) |

```text
load hooks   = WHAT (fetch для логики)
DataGraph    = WHO/WHEN + cache + snapshot + handoff
ViewGraph    = HOW (view spec → payload → DOM)
```

---

## Pipeline (актуально)

```text
reenter shortcut? → без полного load (см. parity: reenter policy — ~)

иначе:
  1. runGuards       leave → enter
  2. runLoads        ResourceGraph.load → dataGraph.load(enter, { branch, transaction, mode })
                     + viewGraph (viewSnapshot)
  3. runRender       outlet + content (ctx.data из snapshot)
  4. runAfter        left → entered
```

Код: `NavigationTransactionPipeline.runLoads()` → `resource-graph/` → `data-graph/data-graph.ts`.

### API (как в коде)

```typescript
// Owned by ResourceGraph — one DataGraph per engine
dataGraph.load(
  enterRoutes: readonly MatchedRouteInfo[],
  options: {
    branch?: readonly MatchedRouteInfo[];  // full chain incl. LCA parents
    transaction: NavigationTransaction;
    mode: 'navigation' | 'prefetch';
  },
): Promise<DataGraphLoadResult>;  // { data?: Map, error? }

dataGraph.invalidate(options?: RouterInvalidateOptions): number;
dataGraph.snapshot(branch): DataSnapshot | undefined;
dataGraph.getData(match): unknown;

// Public DX
router.invalidate(options?)      // → invalidateData → DataGraph
router.invalidateView(options?)  // ViewGraph — отдельно

// Child load hook (opt-in)
await ctx.parent?.()  // nearest ancestor payload (batch deferred / handoff / cache)
```

Prefetch — **не** отдельный `dataGraph.prefetch()`: тот же `load(..., { mode: 'prefetch' })` из `PrefetchPipeline` → `ResourceGraph`.

---

## SWR внутри `load()`

```text
для каждого enter route (parallel):
  key = match.dataKey  // data:{routeId…} из matcher / resource-keys

  fresh   → cache hit, hook fetch пропускаем
  stale   → отдать кэш + revalidate в фоне (AuraResolvableCache)
  missing → await load hooks → cache

  child может await ctx.parent() → join nearest ancestor

вернуть DataSnapshot (Map<dataKey, data>)  // navigation: без partial при error
```

Default: `staleTime: 30_000`, `gcTime: 5 min` (`ENGINE_DEFAULTS.dataCache`).  
Global: `AuraRouter.configure({ dataCache: { max, staleTime, gcTime } })`.

Подробнее: **[DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md)**.

---

## Prefetch

Guards на prefetch **не вызываем**. Prepare идёт через общий `ResourceGraph.load` с `mode: 'prefetch'` (+ handoff buffer).

```text
hover /users:
  PrefetchPipeline → plan → ResourceGraph.load(..., mode: 'prefetch')
  // dataGraph + viewGraph soft-skip errors

click /users:
  guards → ResourceGraph.load(..., mode: 'navigation')  // cache hit / SWR / handoff join
```

| | `mode: 'navigation'` | `mode: 'prefetch'` |
|--|----------------------|--------------------|
| Guards | да (снаружи) | нет |
| ошибка / cancel | fail navigation / cancelled | soft skip, partial `data` ok |
| Handoff | join prepare work | hold prepare work |

---

## Модуль (факт)

```text
src/modules/aura-routing-engine/core/data-graph/
  data-graph.ts       load({ mode }), invalidate, snapshot, ctx.parent wiring
  route-data.ts       resolveRouteData, closestRouteWithLoadHooks
  index.ts

Owner:     core/resource-graph/  (HandoffCache + DataGraph + ViewGraph)
Тесты:     test/data-graph/data-graph.test.ts, route-data.test.ts
Store:     aura-cache-store (AuraResolvableCache) + HandoffCache
```

---

## Критерии готовности

### v1 — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Ключ: `match.dataKey` (route + params + hooks)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `staleTime`, `gcTime`, stale-while-revalidate
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Cache hit → skip hook fetch
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> LCA snapshot из кэша
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `load()` navigation vs prefetch — разная политика error
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Parallel enter loads + sibling abort; parallel hooks на route (`load="a,b"`)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `await ctx.parent()` (opt-in)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Wired: pipeline `runLoads` + PrefetchPipeline + ResourceGraph handoff
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `router.invalidate()` + `data-invalidated`
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Тесты: hit, payload, cancel, prefetch, invalidate, LCA, `parent()`

### Parity / gaps — см. связанные доки

| Задача | Статус | Док |
|--------|--------|-----|
| `shouldRevalidate` per navigation | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [DATA_SWR_PARITY](./DATA_SWR_PARITY.md) |
| Per-route `staleTime` / `gcTime` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [DATA_SWR_PARITY](./DATA_SWR_PARITY.md) |
| `cause: 'preload' \| 'enter'` в context | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [DATA_SWR_PARITY](./DATA_SWR_PARITY.md) |
| Reenter load policy (формальная) | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | [DATA_SWR_PARITY](./DATA_SWR_PARITY.md) |
| Devtools / debug events | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [CACHE_DEVTOOLS](./CACHE_DEVTOOLS.md) |
| Parent→child load join | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | [DATAGRAPH_LOAD_DAG](../todo/DATAGRAPH_LOAD_DAG.md) |
| View SWR default | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [CONTENT_CACHE](./CONTENT_CACHE.md) |
| defer / UI на stale / … | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [DATAGRAPH_GAPS](./DATAGRAPH_GAPS.md) |

---

## Open questions

1. ~~**Единый CacheStore namespace** с content~~ — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> общая инфра `aura-cache-store`, отдельные инстансы (DataGraph / ViewPayloadCache).
2. **`onLoad()` на route** — вызывается на каждой navigation, включая cache hit (by design)?
3. Per-route **`cache="data"`** — только routes с флагом пишут в DataGraph cache; default-on или оставить opt-in?
4. ~~Default child wait vs только `ctx.parent()`~~ — принят opt-in ([DATAGRAPH_LOAD_DAG.md](../todo/DATAGRAPH_LOAD_DAG.md)); engine-forced ⊘.

---

## Связанные документы

- [DATA_SWR_PARITY.md](../todo/DATA_SWR_PARITY.md) — зрелый data/SWR vs TanStack/RR7
- [DATAGRAPH_GAPS.md](../todo/DATAGRAPH_GAPS.md) — пробелы v1 (defer, revalidate, …)
- [DATAGRAPH_LOAD_DAG.md](../todo/DATAGRAPH_LOAD_DAG.md) — parallel default + opt-in `parent()` (engine-forced DAG ⊘)
- [CONTENT_CACHE.md](../todo/CONTENT_CACHE.md) — view track
- [../done/LINK_DRIVEN_PRELOAD.md](../done/LINK_DRIVEN_PRELOAD.md)
- [../done/RESOURCE_GRAPH_HANDOFF.md](../done/RESOURCE_GRAPH_HANDOFF.md)
- [../PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md)
- [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md)

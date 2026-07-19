# DataGraph: зависимости load (parent→child)

> **Статус:** <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ПРИНЯТАЯ МОДЕЛЬ</span> — parallel default + opt-in `ctx.parent()` (SvelteKit-style)  
> **Сверка с кодом:** 2026-07-19  
> **Приоритет:** закрыто для parent→child; optional `deps` — YAGNI  
> **Owner prepare:** [`ResourceGraph`](../../src/modules/aura-routing-engine/core/resource-graph/resource-graph.ts) · **data joins:** [`DataGraph`](../../src/modules/aura-routing-engine/core/data-graph/data-graph.ts)  
> **См. также:** [DATAGRAPH_GAPS.md §11c](./DATAGRAPH_GAPS.md#11c-внутри-load-хука-нет-ctxdata-от-родителя) · [../done/RESOURCE_GRAPH_HANDOFF.md](../done/RESOURCE_GRAPH_HANDOFF.md) · [../done/DATAGRAPH.md](../done/DATAGRAPH.md) · [ARCHITECTURE_BENCHMARK.md §2](../ARCHITECTURE_BENCHMARK.md)

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | каркас / opt-in есть |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано (и нужно) |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> | сознательно не в scope / отвергнуто |

### Сводка прогресса

| Блок | Где | Статус | Примечание |
|------|-----|--------|------------|
| Prepare owner + plan buckets | ResourceGraph | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `buildLoadPlan` → data / view / viewWithData |
| Resource waves (data ‖ content → after-data) | ResourceGraph.execute | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | **не** parent→child load order |
| Parallel enter loads (`Promise.all`) | DataGraph | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | **by design** — child не ждёт, пока сам не попросит |
| `await ctx.parent()` (opt-in join) | DataGraph | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | child **сам** задаёт, когда ждать |
| Parallel hooks на одном route (`load="a,b"`) | DataGraph | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `Promise.all` в `callLoadHooks` |
| Sibling abort on redirect/cancel | DataGraph | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | на весь data batch |
| Engine-forced: child ждёт parent без `parent()` | — | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | отвергнуто (TanStack-style); см. модель ниже |
| Explicit `deps` на hook / topo waves | DataGraph | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | YAGNI, пока хватает `parent()` + один hook |
| Abort per load-deps wave | — | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | только если появятся D-waves |

---

## Принятая модель одной фразой

**Default parallel + opt-in join.** Все enter `load` стартуют сразу; child, которому нужны данные родителя, сам пишет `await ctx.parent()` (как SvelteKit). Independent child **не** платит latency родителя.

Это не «недоделанный TanStack DAG», а сознательный выбор: порядок задаёт hook, а не невидимый engine edge на каждый parent→child.

```text
// child не зависит от parent — оба сразу
load(settings) ║ load(profile)

// child зависит — сам join
load(settings) ║ load(users) { await ctx.parent() → ждёт settings }
```

Тест-контракт: `keeps enter loads parallel when child does not call parent()`.

---

## Две оси — не путать

| Ось | Вопрос | Owner | Статус |
|-----|--------|-------|--------|
| **Resource waves** | data vs content vs content-after-data? | `ResourceGraph` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **Parent→child data join** | Когда child ждёт parent load? | `DataGraph` + `ctx.parent()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> opt-in |
| **Engine-forced load DAG** | Всегда child после parent без `parent()`? | — | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> |
| **Lifecycle** | guard / leave / ready | Pipeline | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> sequential |

```text
Pipeline.runLoads
       │
       ▼
ResourceGraph.load(enterRoutes, ctx)          ← prepare owner
       │
       ├─ buildLoadPlan → { dataRoutes, viewRoutes, viewWithDataRoutes }
       │
       └─ execute:
            wave R1:  dataGraph.load(dataRoutes)  ║  viewGraph.load(viewRoutes)
            wave R2:  viewGraph.load(viewWithDataRoutes)
                         │
                         ▼
            DataGraph.loadEnterRoutes:
                 Promise.all(dataRoutes)          ← parallel by design
                 + await ctx.parent()             ← opt-in join (deferred / LCA / handoff)
```

**Имена:** `ResourceGraph.buildLoadPlan` = resource buckets. Не путать с отвергнутым «topo load-deps plan».

---

## Lifecycle vs prepare vs data join

| Уровень | Что | Как сейчас |
|---------|-----|------------|
| **Lifecycle** | `leave`, `guard`, `ready` | Sequential |
| **Resource prepare** | data + view + handoff | RG: R1 data ‖ view → R2 viewWithData |
| **DataGraph load** | `load` hooks | Parallel batch; join только через `ctx.parent()` |

```text
guards:   leave → guard…                         // sequential
prepare:  data ║ view → viewNeedsData             // ResourceGraph
loads:    load(A) ║ load(B)                       // DataGraph default
          load(B) { await ctx.parent() }          // opt-in join
render:   branch mount root → leaf
```

---

## Сравнение с «топ» роутерами

| Роутер | Механизм | Близко к aura? |
|--------|----------|----------------|
| **SvelteKit** | `parent()` в `load` — child явно ждёт | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> та же идея |
| **TanStack / RR7** | engine часто гарантирует parent data до child loader | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> не цель |

| | Industry | Aura | Статус |
|---|----------|------|--------|
| Prepare orchestration | framework schedule | ResourceGraph | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| data ‖ content | вместе / defer | R1/R2 в RG | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Parent → child data | встроено **или** `parent()` | **только** opt-in `ctx.parent()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (SvelteKit-style) |
| Несколько load на route | один / parallel | `Promise.all` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Engine-forced topo waves | у части роутеров | нет | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> by design |

---

## Как устроено в aura (as-is)

### ResourceGraph: prepare + resource waves — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

```typescript
// wave R1: data ║ independent views; wave R2: viewWithData after data
const [dataResult, viewResult] = await Promise.all([dataPromise, contentPromise]);
await this.viewGraph.load(viewWithDataRoutes, …, { data: … });
```

Код: [`resource-graph.ts`](../../src/modules/aura-routing-engine/core/resource-graph/resource-graph.ts) · [RESOURCE_GRAPH_HANDOFF.md](../done/RESOURCE_GRAPH_HANDOFF.md).

### DataGraph: parallel + opt-in `parent()` — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

```typescript
// default — все dataRoutes сразу
await Promise.all(enterRoutes.map(...))

// child сам решает ждать:
fn: async (ctx) => {
  const parentData = await ctx.parent?.();
  return fetchUsers(parentData.orgId);
}
```

- В batch: deferred payload родителя.
- Parent вне `enterRoutes` (LCA): handoff → long cache (`resolveParentDeferred`).
- Без `parent()` — fully parallel (зафиксировано тестом).

Код: [`data-graph.ts`](../../src/modules/aura-routing-engine/core/data-graph/data-graph.ts) — JSDoc: *«Child may `await ctx.parent()`; default is parallel»*.

### Parallel hooks на одном route — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

`load="a,b"` → `Promise.all`. Cross-hook deps — вручную в одном hook или (опционально позже) `deps`.

### Lifecycle — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>

Не цель. Guards до `runLoads`.

---

## Примеры

### 1. Child зависит от parent — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

```text
/settings          load: fetchSettings  →  { orgId }
  /settings/users  load: fetchUsers(orgId)  // await ctx.parent()
```

Без `parent()` оба parallel — **ок**, если зависимости нет.  
С `parent()` — join. Это и есть API.

### 2. Independent layout + leaf — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

```text
load: settings ║ profile   // child не вызывает parent() → не ждёт
```

### 3. Sibling switch + LCA — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

`ctx.parent()` → cache / handoff родителя вне `enterRoutes`.

### 4. View ждёт own data — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (ResourceGraph)

`viewWithDataRoutes` после data — другая ось, уже ✓.

### 5. Несколько load на route — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

Parallel. Нужен порядок `a`→`b` — один hook или будущий optional `deps` (⊘ YAGNI).

---

## Почему не «default child waits parent»

| Подход | Плюс | Минус |
|--------|------|-------|
| **Opt-in `parent()` (принят)** | Independent child не ждёт; явный join в коде | Нужно помнить вызвать `parent()` |
| **Engine-forced wait (⊘)** | «Безопасно по умолчанию» как TanStack | Лишняя latency на каждом nested enter; скрытый порядок |

Aura выбирает первый: **не надо — не жди; надо — сам задай**.

---

## Optional later (не блокер)

| Вариант | Описание | Статус |
|---------|----------|--------|
| **A — `parent()`** | child `await ctx.parent()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **B — explicit `deps`** | `deps: ['fetch-settings']` на hook (в т.ч. same-route) | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> YAGNI |
| **C — один loader + внутренний `Promise.all`** | DX без engine | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> best practice |
| **Engine topo waves + default wait** | `LoadNode` / `runDataLoadWaves` | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> отвергнуто |

Если когда-нибудь понадобится B — тогда и появятся D-waves / per-wave abort. До product-demand не планировать.

### Отмена

`siblingAbort` на data enter batch — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>. Per-wave abort — ⊘ вместе с D-waves.

---

## Границы (non-goals)

- Engine-forced parent→child wait без `parent()` — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>
- Ломать ResourceGraph resource waves / handoff — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>
- Lifecycle sequential — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>
- defer — другой TODO ([DATAGRAPH_GAPS §1](./DATAGRAPH_GAPS.md#1-разные-режимы-загрузки-для-разных-маршрутов))

---

## План (фактически закрыт)

| # | Задача | Статус |
|---|--------|--------|
| 0 | ResourceGraph prepare owner + R1/R2 | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| 1–3 | `LoadNode` / `buildDataLoadWaves` / `runDataLoadWaves` (engine-forced DAG) | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> |
| 4 | `ctx.parent()` + LCA / handoff | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| 5 | Parallel hooks `load="a,b"` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| 6 | Тесты: parallel default, `parent()` join, LCA, abort | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| 7 | Docs: модель opt-in (этот файл + benchmark) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| 8 | Explicit `deps` | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> YAGNI |

**Тесты:** `test/data-graph/data-graph.test.ts` · `test/resource-graph/*`.

---

## Критерии готовности

- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Prepare: `ResourceGraph.load`; data ‖ view → viewWithData
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Default parallel: child без `parent()` не ждёт parent
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Opt-in: `await ctx.parent()` — join nearest ancestor / LCA / handoff
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Independent loads на route (`load="a,b"`)
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Sibling abort на data batch
- <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> Engine-forced wait / topo D-waves — не критерий

---

## Связанные документы

| Документ | Связь |
|----------|-------|
| [RESOURCE_GRAPH_HANDOFF.md](../done/RESOURCE_GRAPH_HANDOFF.md) | Prepare owner, handoff, resource buckets |
| [DATAGRAPH.md](../done/DATAGRAPH.md) | As-is DataGraph v1 |
| [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) | Общие пробелы; §11c закрыт через `parent()` |
| [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | Parity vs TanStack (другая ось: SWR / revalidate) |
| [ARCHITECTURE_BENCHMARK.md](../ARCHITECTURE_BENCHMARK.md) | §2 — opt-in join, не «неполный DAG» |
| [NESTED_ROUTES.md](../NESTED_ROUTES.md) | Nested tree + LCA |

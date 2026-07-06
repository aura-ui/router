# DataGraph: DAG зависимостей load (parent→child)

> **Статус:** ✗ не реализовано · **Приоритет:** средний–высокий (data-heavy nested apps)  
> **Проверено по коду:** 2026-07-06  
> **См. также:** [DATAGRAPH_GAPS.md §11c](./DATAGRAPH_GAPS.md#11c-внутри-load-хука-нет-ctxdata-от-родителя) · [ARCHITECTURE_BENCHMARK.md §2](../ARCHITECTURE_BENCHMARK.md) · [DATAGRAPH.md](./DATAGRAPH.md)

---

## Проблема одной фразой

У TanStack Router / React Router 7 / SvelteKit зависимости **parent → child** для loaders выражены в **графе** (DAG): роутер знает, что child ждёт parent data, а независимые sibling'и грузятся параллельно.

У aura **параллелизм есть на уровне enter-ветки** (`Promise.all` по `enterRoutes`), но **нет планировщика зависимостей**: все load на enter-ветке стартуют одновременно; порядок parent/child не гарантирован; несколько `load`-хуков на одном маршруте идут последовательно.

---

## Два уровня «параллельности»

При nested-навигации engine делает две разные вещи:

| Уровень | Что | Как сейчас в aura |
|---------|-----|-------------------|
| **Lifecycle** | `leave`, `guard`, `ready`, transitions | Последовательно: фаза за фазой, маршрут за маршрутом (`runLifecyclePhase` → `for`) |
| **DataGraph load** | `load`-хуки, fetch, кэш | Параллельно между маршрутами в `enterRoutes`; последовательно внутри одного route |

```text
guards:  leave(profile) → guard(settings) → guard(profile)   // sequential
loads:   load(settings) ║ load(profile)                      // Promise.all
render:  branch mount root → leaf
```

Lifecycle — **дерево** (фиксированный порядок parent→child на enter, child→parent на exit).  
Load — **«все enter siblings сразу»**, без edges parent→child.

---

## Что такое DAG в контексте роутеров

**DAG** (directed acyclic graph) — граф зависимостей «A ждёт B»:

```text
load(settings)  ──►  load(profile)
       │
       └──── параллельно с load(notifications)   // если independent sibling
```

Планировщик решает:

- что стартовать **сразу** (независимые узлы);
- что **ждёт** результата родителя или другого load;
- что **отменить**, если sibling вернул redirect/cancel.

### Как у «топ» роутеров

| Роутер | Механизм |
|--------|----------|
| **TanStack Router** | `loader` на route record; child через `parentMatch.loaderData`; siblings без deps — parallel |
| **React Router 7 / Remix** | иерархия `loader` + `defer`; parent data в child loader |
| **SvelteKit** | `+layout.server.ts` / `+page.server.ts`; `parent()` в `load` — child явно ждёт parent |

Пример TanStack (упрощённо):

```typescript
// child loader явно читает parent data — engine гарантирует порядок
loader: ({ parentMatch }) => {
  const { orgId } = parentMatch.loaderData;
  return fetchUsers(orgId);
};
```

---

## Как устроено в aura сейчас (as-is)

### DataGraph: parallel enter branch

```typescript
// data-graph.ts — все enter-маршруты с load стартуют одновременно
await Promise.all(enterRoutesWithLoadHooks.map(...))
```

Код: `runParallelNavigationLoads()` в [`data-graph.ts`](../../src/modules/aura-routing-engine/core/data-graph/data-graph.ts).

### Внутри одного маршрута — sequential hooks

```typescript
// runLoadPhaseHooks — for (const name of hookNames) { await ... }
```

Несколько хуков `load="a,b"` на одном `<aura-route>`: latency = **sum**, не **max**.

### Lifecycle — sequential per route

```typescript
// navigation-transaction-pipeline.ts — runLifecyclePhase
for (const matchedRoute of matchedRoutes) {
  await NavigationTransactionPipelinePhase.run(...)
}
```

### Нет `ctx.data` от parent в том же load-проходе

Данные родителя попадают в контекст **после** загрузки — в render / `onLoad`. Дочерний `load` в том же `Promise.all` **не может** полагаться на результат родительского load без workaround. См. [DATAGRAPH_GAPS.md §11c](./DATAGRAPH_GAPS.md#11c-внутри-load-хука-нет-ctxdata-от-родителя).

---

## Сравнение

| | TanStack / RR7 / SvelteKit | Aura (июль 2026) |
|---|---------------------------|------------------|
| Модель | Дерево routes + явные deps | Дерево routes + фиксированный pipeline |
| Параллель между routes | По графу: independent — parallel, dependent — wait | Все `enterRoutes` с load — **всегда parallel** |
| Parent → child data | Встроено в loader API | Нет — workaround в хуке / один load на parent |
| Несколько load на route | Один loader или parallel внутри | **Последовательно** |
| Lifecycle (guard…) | Частично в beforeLoad/loader | **Всегда sequential** по ветке |

---

## Примеры: когда это важно

### 1. Child зависит от parent data (критичный gap)

```text
/settings          load: fetchSettings  →  { orgId }
  /settings/users  load: fetchUsers(orgId)
```

**TanStack:** child loader получает parent data — порядок гарантирован.

**Aura:** оба в `Promise.all` — `fetchUsers` может стартовать **до** завершения `fetchSettings`.

**Workaround сегодня:**

- один `load` на parent, который тянет всё для ветки;
- внешний store / `await` внутри хука;
- `preserve="data"` на parent — при повторном входе snapshot с LCA без refetch.

### 2. Cold enter: layout + leaf (частично ок)

```text
enterRoutes: [ settings, profile ]
load:        settings ║ profile    // 2 parallel — ок, если profile не зависит от settings
```

### 3. Sibling switch (обычно ок)

```text
/settings/profile → /settings/security
enterRoutes: [ security ]   // один load — параллелизм не нужен
```

### 4. Несколько тяжёлых load на одном route

```html
<aura-route path="/home" load="fetch-banners,fetch-feed"></aura-route>
```

**Aura:** `fetch-banners` → потом `fetch-feed` (sequential).  
**TanStack:** часто один loader с `Promise.all` внутри или разнесение по routes.

### 5. Когда почти не важно

- flat routes, один `load` на страницу;
- sibling nav (меняется только leaf);
- Tier 0 без load;
- parent load лёгкий / не нужен child'у при cold enter.

---

## Целевое поведение

### Wave scheduling (предложение)

```text
1. Построить граф: route nodes + load nodes + edges
     - parent route → child route (default: child waits parent load)
     - explicit: hook A → hook B на том же route
     - independent siblings: no edge → same wave

2. Topological sort → waves:
     wave 1: [fetchSettings, fetchNotifications]
     wave 2: [fetchProfile]              // needs settings

3. Promise.all внутри wave; waves — последовательно

4. Lifecycle guards — отдельно, до load graph (как сейчас)
```

### API (черновик)

**Вариант A — implicit (как SvelteKit):** child `load` получает `ctx.parentData` / snapshot с уже загруженных ancestor nodes в той же навигации.

**Вариант B — explicit deps в хуке:**

```typescript
defineRouteHook({
  name: 'fetch-users',
  deps: ['fetch-settings'],  // или parent route pattern
  fn: (ctx) => fetchUsers(ctx.parentData.orgId),
});
```

**Вариант C — один loader, parallel внутри (DX без engine change):** документировать как best practice до DAG — не заменяет engine-level guarantee.

### Отмена и redirect

Сохранить текущий `siblingAbort` при terminal outcome, но применять **по wave**, не обязательно ко всем enter routes сразу.

---

## Границы задачи (non-goals на v1 DAG)

- Не заменять lifecycle sequential model (guard order остаётся).
- Не смешивать с **defer** ([DATAGRAPH_GAPS.md §1](./DATAGRAPH_GAPS.md#1-разные-режимы-загрузки-для-разных-маршрутов)) — defer = после commit; DAG = порядок blocking loads.
- Prefetch остаёт best-effort parallel ([PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md)).

---

## План реализации (черновик)

| # | Задача | Зависимости |
|---|--------|-------------|
| 1 | Модель `LoadNode` + edges (parent→child default) | DataGraph v1 |
| 2 | `buildLoadPlan(enterRoutes, activeChain)` → waves | route-tree chain |
| 3 | `runWaves()` вместо flat `Promise.all` | #1–2 |
| 4 | `ctx.parentData` / snapshot в child load ctx | #3 |
| 5 | Parallel hooks на одном route (`load="a,b"` independent) | #1 |
| 6 | Тесты: parent→child order, independent siblings, abort on redirect | #3 |
| 7 | Документация + migration от workarounds | #4 |

---

## Критерии готовности

- [ ] Cold enter `/settings/users`: `load(settings)` завершается до старта `load(users)`, если child объявлен dependent (default для nested).
- [ ] Independent loads на одном route (`load="a,b"`) выполняются параллельно, когда нет deps.
- [ ] Sibling nav не регрессирует (один enter load).
- [ ] Redirect/cancel на parent load не даёт child load стартовать с устаревшим контекстом.
- [ ] `ARCHITECTURE_BENCHMARK.md` — пункт про DAG можно снять или пометить ✓.

---

## Связанные документы

| Документ | Связь |
|----------|-------|
| [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) | Общие пробелы DataGraph; §11c — краткая отсылка сюда |
| [DATAGRAPH.md](./DATAGRAPH.md) | As-is DataGraph v1 |
| [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | Parity vs TanStack loaders |
| [ARCHITECTURE_BENCHMARK.md](../ARCHITECTURE_BENCHMARK.md) | Benchmark «не полный DAG» |
| [NESTED_ROUTES.md](../NESTED_ROUTES.md) | Nested tree + LCA (shipped) |

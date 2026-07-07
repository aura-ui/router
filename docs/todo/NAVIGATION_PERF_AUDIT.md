# Navigation hot path — аудит производительности

> **Статус:** аудит кода, июль 2026 · **Bench:** [`../../bench/README.md`](../../bench/README.md) · **Отчёты:** `bench/reports/<scenario>/`  
> **Сверка:** 2026-07-06 · код не менялся — только фиксация узких мест  
> **Связано:** [ARCHITECTURE_BENCHMARK.md](../ARCHITECTURE_BENCHMARK.md) · [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md) · [IMPLEMENTATION_STEPS.md](../IMPLEMENTATION_STEPS.md)

---

## Поток навигации (as-is)

```text
navigateTo (AuraRoutingEngine)
  → parsePath + resolveNavigationTarget (match all nodes)
  → NavigationCoordinator.run (dedupe / supersede)
  → NavigationTransaction.run
      → buildTransitionPlan
      → pipeline: update | fast | full
          → guards (leave→guard) → loads (DataGraph) → history → render → afterRender
```

Nested default: `resolveEnterBranch` (async parallel) → `mountEnterBranch` (sync root→leaf burst).

---

## Critical

### 1. `new URLPattern()` на каждый match-кандидат

**Что:** `AuraRoutingUrlMatcher.getPathParams()` создаёт `new URLPattern({ pathname: pattern })` без memoization.

**Почему медленно:** компиляция паттерна на каждый узел × каждую навигацию/prefetch.

**Когда бьёт:** любой navigate; масштабируется с `matchableNodes.length`.

**Код:** `src/modules/aura-routing-engine/core/match/url-matcher.ts` — `getPathParams` (~L85–108), `matchPath` (~L61–74)

**Bench:** `bench/scenarios/url-matcher.bench.ts` — `matchPath scale`, `getPathParams cold`

---

### 2. Линейный O(n) URL matching

**Что:** полный перебор `matchableNodes`, best score — без trie/radix.

**Когда бьёт:** 50+ маршрутов; prefetch дублирует тот же match.

**Код:** `url-matcher.ts` `matchPath`; `AuraRoutingRouteRegistry.getMatchableNodes()`

**Bench:** `url-matcher.bench.ts` — scale 10 / 50 / 100 / 500

---

### 3. Full DOM replace через `innerHTML`

**Что:** `replaceInner` → `replaceChildren()` + `<template>.innerHTML` parse. `updateInner` v1 = always replace.

**Когда бьёт:** каждый route change с HTML; nested branch mount умножает на depth.

**Код:** `src/modules/aura-dom/core/patch.ts`; `aura-outlet/core/aura-outlet.ts` `asRoot`

**Bench:** `bench/scenarios/dom-patch.bench.ts`

---

### 4. Branch mount — sync DOM burst без yield

**Что:** после parallel resolve — `mountEnterBranch` синхронно `applyPreResolved` root→leaf в одном task.

**Когда бьёт:** deep nested layouts; long task / jank.

**Код:** `view-mount/branch-mount.ts`; `navigation-transaction-pipeline.ts` `runBranchAtomicRender`

**Bench:** интеграционный — `bench/scenarios/navigation-pipeline.bench.ts` (mock mount timing)

---

## High

### 5. Ancestor param re-match в `attachNavigationChain`

**Что:** для каждого non-leaf в chain снова `getPathParams(pathname, node.pattern)`.

**Код:** `route-tree/matched-chain.ts` `attachNavigationChain` (~L124–129)

**Bench:** `matched-chain.bench.ts`

---

### 6. Full `buildRouteTree` на `refreshRoutes`

**Что:** rebuild snapshot, `parent.branch.concat(node)` per node, bump generation → prefetch cache miss.

**Код:** `aura-routing-route-registry.ts`; `build-route-tree.ts`

**Bench:** `route-tree.bench.ts`

---

### 7. Prefetch: full match+plan на hover до debounce

**Что:** `mouseover` → `resolveModeForLink` → `PrefetchPlanResolver.resolve` (match + `buildTransitionPlan`). Debounce только на run.

**Код:** `user-actions/link-prefetch-intent.ts`; `prefetch/pipeline.ts` ~L150–162; `prefetch/plan.ts`

**Bench:** `prefetch-plan.bench.ts`

---

### 8. Tier 0 узкий; `hasSyncContent` не в pipeline

**Что:** `canUseFastPath` — 1 enter, ≤1 exit, zero hooks/async. `hasSyncContent` не подключён.

**Код:** `route-tree/can-use-fast-path.ts`; `aura-route.ts` `hasSyncContent` (~L151–156)

**Bench:** `navigation-pipeline.bench.ts` — `canUseFastPath` gate sweep

---

### 9. Sequential lifecycle + sequential hooks

**Что:** full pipeline macro-steps sequential; `runLifecyclePhase` for-await routes; `HookRegistry.run` for-await hooks.

**Код:** `navigation-transaction-pipeline.ts`; `hooks/registry.ts`

**Bench:** `navigation-pipeline.bench.ts` — phase loop mock

---

### 10. Legacy `renderEnterRoutes` sequential

**Что:** без branch mount — `runViewCommit` в цикле, не parallel resolve.

**Код:** `navigation-transaction-pipeline.ts` `renderEnterRoutes` (~L301–324)

---

### 11. Branch mount обходит preserve fast paths

**Что:** `syncBranchMount` без `tryCacheRestore` / `trySkipAlreadyMounted`.

**Код:** `view-render-pipeline.ts` `syncBranchMount` vs `resolveAndMount`

---

### 12. Layout `cache: false`

**Что:** каждый enter с layout — `getElementById` + clone заново.

**Код:** `content-load-service.ts` ~L50–54

---

### 13. `onLoad` на каждую навигацию при cache hit

**Код:** `data-graph.ts` `ensureNavigationLoad` ~L192–194

**Bench:** `data-graph.bench.ts`

---

## Medium

| # | Проблема | Код |
|---|----------|-----|
| 14 | `findChildOutlet` → `querySelector` каждый mount | `aura-outlet.ts`, `outlet-adapter.ts` |
| 15 | `AuraRoute.render()` через `setupDone.then` | `aura-route.ts` |
| 16 | Два document capture listeners | `link-navigation.ts`, `link-prefetch-intent.ts` |
| 17 | Staged transitions — 2 view roots в DOM | `aura-outlet.ts` `applyStage` |
| 18 | Load hooks на route — sequential | `data-graph.ts` `runLoadPhaseHooks` |
| 19 | Нет DAG parent→child для loads | `data-graph.ts` `runParallelNavigationLoads` |
| 20 | `parsePath` → `new URL` per navigate | `aura-utils/misc/url.ts` |

---

## Low

- `routeScore` — `pattern.split('/')` per candidate (`url-matcher.ts`)
- Hook context spread per invocation (`hooks/registry.ts`)
- Prefetch plan cache miss on `from` change (`prefetch/plan.ts`)

---

## Memory / GC

| Concern | Evidence |
|---------|----------|
| `branch` array concat per node | `build-route-tree.ts` ~L149 |
| New `MatchedRouteInfo` + chain per match | `matched-chain.ts` |
| Detached DOM / preserve stash | `outlet-adapter.ts`, `view-cache.ts` |
| Full tree discard on refresh | `aura-routing-route-registry.ts` |

---

## Уже оптимизировано хорошо

- Coordinator dedupe / supersede / cancel-pending
- `runUpdate` — param/query shortcut
- Tier 0 fast path (когда попадает)
- Hash-only bypass
- `resolveEnterBranch` — `Promise.all`
- DataGraph — parallel sibling loads + SWR
- Prefetch — inflight dedupe, debounced run, content pool
- View early exit на async path (cache restore, skip mounted)
- Делегированные links без rescan

---

## Топ-10 исправлений (приоритет)

| # | Задача | Bench scenario |
|---|--------|----------------|
| 1 | Memoize URLPattern per pattern | `url-matcher` → `getPathParams` |
| 2 | Indexed matcher (trie) | `url-matcher` → scale |
| 3 | Incremental DOM | `dom-patch` |
| 4 | `hasSyncContent` → fast/sync lane | `navigation-pipeline` |
| 5 | preserve paths в branch mount | (integration — TODO) |
| 6 | Cache layout templates | (integration — TODO) |
| 7 | Lightweight prefetch mode lookup | `prefetch-plan` |
| 8 | Cache ancestor params in chain | `matched-chain` |
| 9 | DAG / wave load scheduling | `data-graph` |
| 10 | Incremental route registry | `route-tree` |

---

## Когда боль сильнее по типу приложения

| Тип | Главные bottlenecks |
|-----|---------------------|
| Flat static HTML | #4 fast path, #3 DOM |
| Nested dashboard | #3–4 DOM burst, #11–12 layout/cache |
| 50+ routes | #1–2 matching |
| Link-heavy + prefetch | #7 hover match |
| Data-heavy + preserve | #13 onLoad, #19 DAG, UI on stale ([DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) §7) |

---

## Связанные документы

| Документ | О чём |
|----------|-------|
| [../../bench/README.md](../../bench/README.md) | Запуск bench-сценариев |
| `bench/reports/<id>/latest.md` | Последний отчёт по сценарию |
| [ARCHITECTURE_BENCHMARK.md](../ARCHITECTURE_BENCHMARK.md) | Сравнение с топ-роутерами |
| [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md) | DAG loads — план |
| [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) | Пробелы DataGraph |
| [IMPLEMENTATION_STEPS.md](../IMPLEMENTATION_STEPS.md) §5b, 6b | Fast path, incremental DOM |

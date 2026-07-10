# Navigation hot path — аудит производительности

> **Первичный аудит:** 2026-07-06 · **Сверка с кодом:** 2026-07-10  
> **Легенда:** <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> · <span style="color: #bf8700; font-weight: bold;">~ ЧАСТИЧНО</span> · <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span>  
> **Bench:** [`../../bench/README.md`](../../bench/README.md) · **Отчёты:** `bench/reports/<scenario>/` (последний прогон: 2026-07-07)  
> **Связано:** [ARCHITECTURE_BENCHMARK.md](../ARCHITECTURE_BENCHMARK.md) · [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md) · [IMPLEMENTATION_STEPS.md](../IMPLEMENTATION_STEPS.md)

---

## Сводка (2026-07-10)

| Уровень | Сделано | Частично | Осталось |
|---------|--------:|---------:|---------:|
| Critical (#1–4) | 1 | 0 | 3 |
| High (#5–13) | 0 | 1 | 12 |
| Medium (#14–20) | 0 | 0 | 7 |
| Топ-10 исправлений | 2 | 0 | 8 |

**Итого по пунктам аудита:** <span style="color: #2ea043; font-weight: bold;">2 ✓</span> · <span style="color: #bf8700; font-weight: bold;">1 ~</span> · <span style="color: #cf222e; font-weight: bold;">20 ✗</span> (из 23 actionable)

---

## Поток навигации (as-is)

```text
navigateTo (AuraRoutingEngine)
  → resolveDocumentHrefParts + resolveNavigationTarget (match all nodes)
  → NavigationCoordinator.run (dedupe / supersede)
  → NavigationTransaction.run
      → buildTransitionPlan
      → pipeline: update | fast | full
          → guards (leave→guard) → loads (DataGraph) → history → render → afterRender
```

Nested default: `resolveEnterBranch` (async parallel) → `mountEnterBranch` (sync root→leaf burst).

---

## Critical

### 1. <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> — `new URLPattern()` на каждый match-кандидат

> **Сверка:** 2026-07-10 — `patterns: Map<string, URLPattern>` + `getUrlPattern()`; `matchPath` мемоизирован по `pathname`.

**Было:** `getPathParams()` создавал `new URLPattern({ pathname: pattern })` без memoization.

**Сейчас:** lazy compile + reuse per `pattern`; сброс через `destroy()`.

**Код:** `src/modules/aura-routing-engine/core/match/url-matcher.ts` — `getUrlPattern` (~L212–218), `matchPath` (~L90–100)

**Bench:** `bench/scenarios/url-matcher.bench.ts` — `getPathParams cold` (после fix — warm path)

---

### 2. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Линейный O(n) URL matching

**Что:** полный перебор `matchableNodes`, best score — без trie/radix.

**Когда бьёт:** 50+ маршрутов; prefetch дублирует тот же match.

**Код:** `url-matcher.ts` `matchPath` (комментарий «Линейный O(n) перебор»); `AuraRoutingRouteRegistry.getMatchableNodes()`

**Bench:** `url-matcher.bench.ts` — scale 10 / 50 / 100 / 500

---

### 3. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Full DOM replace через `innerHTML`

**Что:** `replaceInner` → `replaceChildren()` + `<template>.innerHTML` parse. `updateInner` v1 = always replace (`incremental: false`).

**Когда бьёт:** каждый route change с HTML; nested branch mount умножает на depth.

**Код:** `src/modules/aura-dom/core/patch.ts`; `aura-outlet/core/aura-outlet.ts` `asRoot`

**Bench:** `bench/scenarios/dom-patch.bench.ts`

---

### 4. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Branch mount — sync DOM burst без yield

**Что:** после parallel resolve — `mountEnterBranch` синхронно `applyPreResolved` root→leaf в одном task.

**Когда бьёт:** deep nested layouts; long task / jank.

**Код:** `view-mount/branch-mount.ts`; `navigation-transaction-pipeline.ts` `runBranchAtomicRender`

**Bench:** интеграционный — `bench/scenarios/navigation-pipeline.bench.ts` (mock mount timing)

---

## High

### 5. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Ancestor param re-match в `attachNavigationChain`

**Что:** для каждого non-leaf в chain снова `getPathParams(pathname, node.pattern)`.

**Код:** `route-tree/matched-chain.ts` `attachNavigationChain` (~L124–129)

**Bench:** `matched-chain.bench.ts`

---

### 6. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Full `buildRouteTree` на `refreshRoutes`

**Что:** rebuild snapshot, `parent.branch.concat(node)` per node, bump generation → prefetch cache miss.

**Код:** `aura-routing-route-registry.ts`; `build-route-tree.ts`

**Bench:** `route-tree.bench.ts`

---

### 7. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Prefetch: full match+plan на hover до debounce

**Что:** `mouseover` → `resolveModeForLink` → `PrefetchPlanResolver.resolve` (match + `buildTransitionPlan`). Debounce только на run.

**Код:** `user-actions/link-prefetch-intent.ts`; `prefetch/pipeline.ts` `resolveModeForLink` (~L150–162); `prefetch/plan.ts`

**Bench:** `prefetch-plan.bench.ts`

---

### 8. <span style="color: #bf8700; font-weight: bold;">~ ЧАСТИЧНО</span> — Tier 0 узкий; `hasSyncContent`

> **Сверка:** 2026-07-10 — `hasSyncContent` подключён в `canUseFastPath()`; Tier 0 по-прежнему только flat swap (`enterRoutes.length === 1`).

| Подпункт | Статус |
|----------|--------|
| `hasSyncContent` в gate fast path | <span style="color: #2ea043; font-weight: bold;">✓</span> `can-use-fast-path.ts` ~L26 |
| Tier 0 для nested enter-ветки | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Отдельная sync render lane (PR3) | <span style="color: #cf222e; font-weight: bold;">✗</span> |

**Код:** `route-tree/can-use-fast-path.ts`; `aura-route.ts` `hasSyncContent` (~L160)

**Bench:** `navigation-pipeline.bench.ts` — `canUseFastPath` gate sweep

---

### 9. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Sequential lifecycle + sequential hooks

**Что:** full pipeline macro-steps sequential; `runLifecyclePhase` for-await routes; `HookRegistry.run` for-await hooks.

**Код:** `navigation-transaction-pipeline.ts`; `hooks/registry.ts`

**Bench:** `navigation-pipeline.bench.ts` — phase loop mock

---

### 10. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Legacy `renderEnterRoutes` sequential

**Что:** без branch mount — `runViewCommit` в цикле, не parallel resolve.

**Код:** `navigation-transaction-pipeline.ts` `renderEnterRoutes` (~L301–324)

---

### 11. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Branch mount обходит cache.dom fast paths

**Что:** `syncBranchMount` без `tryCacheRestore` / `trySkipAlreadyMounted` (тест подтверждает).

**Код:** `view-render-pipeline.ts` `syncBranchMount` vs `resolveAndMount`

---

### 12. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Layout `cache: false`

**Что:** каждый enter с layout — `getElementById` + clone заново.

**Код:** `content-load-service.ts` ~L51; `view-graph.ts` ~L146

---

### 13. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — `onLoad` на каждую навигацию при cache hit

**Что:** комментарий в коде — «onLoad runs on every navigation, including cache hits».

**Код:** `data-graph.ts` `ensureNavigationLoad` ~L192–194

**Bench:** `data-graph.bench.ts`

---

## Medium

| # | Статус | Проблема | Код |
|---|--------|----------|-----|
| 14 | <span style="color: #cf222e; font-weight: bold;">✗</span> | `findChildOutlet` → `querySelector` каждый mount | `aura-outlet.ts`, `outlet-adapter.ts` |
| 15 | <span style="color: #cf222e; font-weight: bold;">✗</span> | `AuraRoute.render()` через `setupDone.then` | `aura-route.ts` |
| 16 | <span style="color: #cf222e; font-weight: bold;">✗</span> | Два document capture listeners | `link-navigation.ts`, `link-prefetch-intent.ts` |
| 17 | <span style="color: #cf222e; font-weight: bold;">✗</span> | Staged transitions — 2 view roots в DOM | `aura-outlet.ts` `applyStage` |
| 18 | <span style="color: #cf222e; font-weight: bold;">✗</span> | Load hooks на route — sequential | `data-graph.ts` `runLoadPhaseHooks` |
| 19 | <span style="color: #cf222e; font-weight: bold;">✗</span> | Нет DAG parent→child для loads | `data-graph.ts` `runParallelNavigationLoads` |
| 20 | <span style="color: #cf222e; font-weight: bold;">✗</span> | `resolveDocumentHrefParts` / `splitAppHref` → `new URL` per navigate | `aura-utils/misc/url.ts` |

---

## Low

| Пункт | Статус |
|-------|--------|
| `routeScore` — `pattern.split('/')` per candidate | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> |
| Hook context spread per invocation | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> |
| Prefetch plan cache miss on `from` change | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> |

---

## Memory / GC

> Информационный блок — без изменений с 2026-07-06.

| Concern | Evidence |
|---------|----------|
| `branch` array concat per node | `build-route-tree.ts` ~L149 |
| New `MatchedRouteInfo` + chain per match | `matched-chain.ts` |
| Detached DOM / cache.dom stash | `outlet-adapter.ts`, `dom-cache.ts` |
| Full tree discard on refresh | `aura-routing-route-registry.ts` |

---

## Уже оптимизировано хорошо

> Без изменений — подтверждено 2026-07-10.

- Coordinator dedupe / supersede / cancel-pending
- `runUpdate` — param/query shortcut
- Tier 0 fast path (когда попадает)
- Hash-only bypass
- `resolveEnterBranch` — `Promise.all`
- DataGraph — parallel sibling loads + SWR
- Prefetch — inflight dedupe, debounced run, content pool
- View early exit на async path (cache restore, skip mounted)
- Делегированные links без rescan
- **+** URLPattern memoization per route pattern (#1)

---

## Топ-10 исправлений (приоритет)

| # | Статус | Задача | Bench scenario |
|---|--------|--------|----------------|
| 1 | <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> | Memoize URLPattern per pattern | `url-matcher` → `getPathParams` |
| 2 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Indexed matcher (trie) | `url-matcher` → scale |
| 3 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Incremental DOM | `dom-patch` |
| 4 | <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> | `hasSyncContent` → fast path gate | `navigation-pipeline` |
| 5 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | cache.dom paths в branch mount | (integration — TODO) |
| 6 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Cache layout templates | (integration — TODO) |
| 7 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Lightweight prefetch mode lookup | `prefetch-plan` |
| 8 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Cache ancestor params in chain | `matched-chain` |
| 9 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | DAG / wave load scheduling | `data-graph` |
| 10 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Incremental route registry | `route-tree` |

---

## Когда боль сильнее по типу приложения

| Тип | Главные bottlenecks | Статус fix |
|-----|---------------------|------------|
| Flat static HTML | #4 fast path, #3 DOM | fast path <span style="color: #2ea043; font-weight: bold;">✓</span> · DOM <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Nested dashboard | #3–4 DOM burst, #11–12 layout/cache | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| 50+ routes | #1–2 matching | #1 <span style="color: #2ea043; font-weight: bold;">✓</span> · #2 <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Link-heavy + prefetch | #7 hover match | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Data-heavy + cache | #13 onLoad, #19 DAG, UI on stale ([DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) §7) | <span style="color: #cf222e; font-weight: bold;">✗</span> |

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

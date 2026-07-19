# Navigation hot path — аудит производительности

> **Первичный аудит:** 2026-07-06 · **Сверка с кодом:** 2026-07-19  
> **Легенда:** <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> · <span style="color: #bf8700; font-weight: bold;">~ ЧАСТИЧНО</span> · <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span>  
> **Bench:** [`../../bench/README.md`](../../bench/README.md) · **Отчёты:** `bench/reports/<scenario>/` (последний прогон url-matcher: 2026-07-15)  
> **Связано:** [ARCHITECTURE_BENCHMARK.md](../ARCHITECTURE_BENCHMARK.md) · [DATAGRAPH_LOAD_DAG.md](../done/DATAGRAPH_LOAD_DAG.md) · [ATOMIC_BRANCH_COMMIT.md](../done/ATOMIC_BRANCH_COMMIT.md) · [IMPLEMENTATION_STEPS.md](../IMPLEMENTATION_STEPS.md)

---

## Сводка (2026-07-19)

| Уровень | Сделано | Частично | Осталось |
|---------|--------:|---------:|---------:|
| Critical (#1–4) | 1 | 1 | 2 |
| High (#5–13) | 2 | 1 | 6 |
| Medium (#14–20) | 2 | 1 | 4 |
| Low | 1 | 0 | 2 |
| Топ-10 исправлений | 4 | 1 | 5 |

**Итого по пунктам аудита:** <span style="color: #2ea043; font-weight: bold;">6 ✓</span> · <span style="color: #bf8700; font-weight: bold;">3 ~</span> · <span style="color: #cf222e; font-weight: bold;">14 ✗</span> (из 23 actionable)

**С 2026-07-10 → ✓:** #10 legacy sequential render, #11 cache.dom в branch mount, #18 parallel load hooks, #19 parent→child loads (принятая модель), Low `routeScore`  
**С 2026-07-10 → ~:** #2 MatchIndex (static O(1)), #20 `splitAppHref` без `new URL` для `/…`

---

## Поток навигации (as-is)

```text
navigateTo (AuraRoutingEngine)
  → resolveDocumentHrefParts + resolveNavigationTarget (match)
  → NavigationCoordinator.run (dedupe / supersede)
  → NavigationTransaction.run
      → buildTransitionPlan
      → pipeline: update | fast | full
          → guards (leave→guard) → ResourceGraph.load → history → render → afterRender
```

Nested default: ResourceGraph prepare (parallel) → `mountEnterBranch` (sync root→leaf burst).

---

## Critical

### 1. <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> — `new URLPattern()` на каждый match-кандидат

> **Сверка:** 2026-07-19 — `urlPatterns: Map` + `getUrlPattern()`; `matchPath` мемоизирован по `pathname`.

**Было:** `getPathParams()` создавал `new URLPattern({ pathname: pattern })` без memoization.

**Сейчас:** lazy compile + reuse per `pattern`; сброс через `destroy()`.

**Код:** `src/modules/aura-routing-engine/core/match/url-matcher.ts` — `getUrlPattern`, `matchPath`

**Bench:** `bench/scenarios/url-matcher.bench.ts` — `getPathParams cold` (после fix — warm path)

---

### 2. <span style="color: #bf8700; font-weight: bold;">~ ЧАСТИЧНО</span> — Линейный O(n) URL matching

> **Сверка:** 2026-07-19 — `MatchIndex`: static → `exact` Map O(1); dynamic/catch-all → `rest` по-прежнему линейный. Trie/radix нет.

| Подпункт | Статус |
|----------|--------|
| Static exact index (`exact.get(pathname)`) | <span style="color: #2ea043; font-weight: bold;">✓</span> `getMatchIndex` |
| Dynamic / `:param` / catch-all без полного перебора | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Trie / radix tree | <span style="color: #cf222e; font-weight: bold;">✗</span> |

**Когда бьёт:** много dynamic routes; prefetch дублирует тот же match по `rest`.

**Код:** `url-matcher.ts` `matchPath` + `getMatchIndex`; `AuraRoutingRouteRegistry.getMatchableNodes()`

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

**Код:** `view-mount/branch-mount.ts`; `navigation-transaction-pipeline.ts` `commitEnterBranchToDom`

**Bench:** интеграционный — `bench/scenarios/navigation-pipeline.bench.ts` (mock mount timing)

---

## High

### 5. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Ancestor param re-match в `buildActiveChain`

**Что:** для каждого non-leaf в chain снова `getPathParams(pathname, node.pattern)`.

**Код:** `route-tree/matched-chain.ts` `buildActiveChain` (~L127–129)

**Bench:** `matched-chain.bench.ts`

---

### 6. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Full `buildRouteTree` на `refreshRoutes`

**Что:** rebuild snapshot, `parent.branch.concat(node)` per node, bump generation → prefetch cache miss.

**Код:** `aura-routing-route-registry.ts`; `build-route-tree.ts`

**Bench:** `route-tree.bench.ts`

---

### 7. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Prefetch: full match+plan на hover до debounce

**Что:** `mouseover` → `resolveModeForLink` → `PrefetchPlanResolver.resolve` (match + `buildTransitionPlan`). Debounce только на run.

**Код:** `user-actions/link-prefetch-intent.ts`; `prefetch/pipeline.ts` `resolveModeForLink`; `prefetch/plan.ts`

**Bench:** `prefetch-plan.bench.ts`

---

### 8. <span style="color: #bf8700; font-weight: bold;">~ ЧАСТИЧНО</span> — Tier 0 узкий; `hasSyncContent`

> **Сверка:** 2026-07-19 — `hasSyncContent` в gate fast path; Tier 0 по-прежнему только flat swap (`enterRoutes.length === 1`).

| Подпункт | Статус |
|----------|--------|
| `hasSyncContent` в gate fast path | <span style="color: #2ea043; font-weight: bold;">✓</span> `transition-plan.ts` `canUseFastPath` |
| Tier 0 для nested enter-ветки | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Отдельная sync render lane (PR3) | <span style="color: #cf222e; font-weight: bold;">✗</span> |

**Код:** `route-tree/transition-plan.ts`; `aura-route.ts` `hasSyncContent`

**Bench:** `navigation-pipeline.bench.ts` — `canUseFastPath` gate sweep

---

### 9. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Sequential lifecycle + sequential hooks

**Что:** full pipeline macro-steps sequential; `runLifecyclePhase` for-await routes; `HookRegistry.run` for-await hooks. (Transition in/out могут идти `Promise.all` — не lifecycle.)

**Код:** `navigation-transaction-pipeline.ts`; `hooks/registry.ts`

**Bench:** `navigation-pipeline.bench.ts` — phase loop mock

---

### 10. <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> — Legacy `renderEnterRoutes` sequential

> **Сверка:** 2026-07-19 — sequential per-route resolve→mount снят; full path = ResourceGraph + `mountEnterBranch` ([ATOMIC_BRANCH_COMMIT](../done/ATOMIC_BRANCH_COMMIT.md)).

**Было:** `runViewCommit` в цикле по enter-узлам без parallel resolve.

**Сейчас:** prepare ветки → один sync `commitEnterBranchToDom` / `mountEnterBranch`. Fast path — один `runViewCommit`.

**Код:** `navigation-transaction-pipeline.ts` `commitEnterBranchToDom`; `view-mount/branch-mount.ts`

---

### 11. <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> — Branch mount обходит cache.dom fast paths

> **Сверка:** 2026-07-19 — `syncBranchMount` early-exit: `tryCacheRestore` / `trySkipAlreadyMounted`.

**Было:** `syncBranchMount` всегда apply pre-resolved, без DomCache restore.

**Сейчас:** early-exit до apply; тесты + ARCHITECTURE.md.

**Код:** `view-render-pipeline.ts` `syncBranchMount` / `tryEarlyExit`; `view-render-pipeline-phase.ts`

---

### 12. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — Layout `cache: false`

**Что:** каждый enter с layout — `getElementById` + clone заново.

**Код:** `content-load-service.ts`; `view-graph.ts` `buildViewDescriptor` (`cache: false` для layout)

---

### 13. <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> — `onLoad` на каждую навигацию при cache hit

**Что:** при navigation mode `onLoad` вызывается после settle shared load — в т.ч. когда значение пришло из `cache.data`.

**Код:** `data-graph.ts` `loadEnterRoute` (~L256–263)

**Bench:** `data-graph.bench.ts`

---

## Medium

| # | Статус | Проблема | Код |
|---|--------|----------|-----|
| 14 | <span style="color: #cf222e; font-weight: bold;">✗</span> | `findChildOutlet` → `querySelector` каждый mount | `aura-outlet.ts`, `outlet-adapter.ts` |
| 15 | <span style="color: #cf222e; font-weight: bold;">✗</span> | `AuraRoute.render()` через `setupDone.then` | `aura-route.ts` |
| 16 | <span style="color: #cf222e; font-weight: bold;">✗</span> | Два document capture listeners | `link-navigation.ts`, `link-prefetch-intent.ts` |
| 17 | <span style="color: #cf222e; font-weight: bold;">✗</span> | Staged transitions — 2 view roots в DOM | `aura-outlet.ts` `applyStage` |
| 18 | <span style="color: #2ea043; font-weight: bold;">✓</span> | Load hooks на route — были sequential → `Promise.all` | `data-graph.ts` `callLoadHooks` |
| 19 | <span style="color: #2ea043; font-weight: bold;">✓</span> | Parent→child loads: parallel default + `ctx.parent()` ([done](../done/DATAGRAPH_LOAD_DAG.md)); engine-forced DAG ⊘ | `data-graph.ts` `loadEnterRoutes` |
| 20 | <span style="color: #bf8700; font-weight: bold;">~</span> | `splitAppHref('/…')` без `new URL`; `resolveDocumentHrefParts` всё ещё `new URL` | `aura-utils/misc/url.ts`, `app-href.ts` |

---

## Low

| Пункт | Статус |
|-------|--------|
| `routeScore` — `pattern.split('/')` per candidate | <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> — score в `buildRouteTree` → `node.matchScore`; match только читает |
| Hook context spread per invocation | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> |
| Prefetch plan cache miss on `from` change | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> |

---

## Memory / GC

> Информационный блок — без изменений с 2026-07-06 (подтверждено 2026-07-19).

| Concern | Evidence |
|---------|----------|
| `branch` array concat per node | `build-route-tree.ts` |
| New `MatchedRouteInfo` + chain per match | `matched-chain.ts` |
| Detached DOM / cache.dom stash | `outlet-adapter.ts`, `dom-cache.ts` |
| Full tree discard on refresh | `aura-routing-route-registry.ts` |

---

## Уже оптимизировано хорошо

> Подтверждено 2026-07-19.

- Coordinator dedupe / supersede / cancel-pending
- `runUpdate` — param/query shortcut
- Tier 0 fast path (когда попадает)
- Hash-only bypass
- ResourceGraph prepare — parallel data ‖ content
- DataGraph — parallel sibling loads + SWR + opt-in `ctx.parent()`
- Prefetch — inflight dedupe, debounced run, content pool
- View early exit на async path (cache restore, skip mounted)
- **+** `syncBranchMount` early-exit (cache.dom / skip mounted) — #11
- Делегированные links без rescan
- **+** URLPattern memoization per route pattern (#1)
- **+** Static `MatchIndex` O(1) (#2 partial)
- **+** Atomic branch commit вместо sequential `renderEnterRoutes` (#10)
- **+** Parallel load hooks на одном route (#18)
- **+** Precomputed `matchScore` на дереве (Low)

---

## Топ-10 исправлений (приоритет)

| # | Статус | Задача | Bench scenario |
|---|--------|--------|----------------|
| 1 | <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> | Memoize URLPattern per pattern | `url-matcher` → `getPathParams` |
| 2 | <span style="color: #bf8700; font-weight: bold;">~ ЧАСТИЧНО</span> | Indexed matcher (static Map ✓ · trie/dynamic ✗) | `url-matcher` → scale |
| 3 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Incremental DOM | `dom-patch` |
| 4 | <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> | `hasSyncContent` → fast path gate | `navigation-pipeline` |
| 5 | <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> | cache.dom paths в branch mount | (integration + unit) |
| 6 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Cache layout templates | (integration — TODO) |
| 7 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Lightweight prefetch mode lookup | `prefetch-plan` |
| 8 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Cache ancestor params in chain | `matched-chain` |
| 9 | <span style="color: #2ea043; font-weight: bold;">✓ СДЕЛАНО</span> | Parallel loads + `ctx.parent()` (engine DAG ⊘) | `data-graph` |
| 10 | <span style="color: #cf222e; font-weight: bold;">✗ ОСТАЛОСЬ</span> | Incremental route registry | `route-tree` |

---

## Когда боль сильнее по типу приложения

| Тип | Главные bottlenecks | Статус fix |
|-----|---------------------|------------|
| Flat static HTML | #4 fast path, #3 DOM | fast path <span style="color: #2ea043; font-weight: bold;">✓</span> · DOM <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Nested dashboard | #3–4 DOM burst, #12 layout cache | #11 cache.dom <span style="color: #2ea043; font-weight: bold;">✓</span> · layout/DOM <span style="color: #cf222e; font-weight: bold;">✗</span> |
| 50+ routes | #1–2 matching | #1 <span style="color: #2ea043; font-weight: bold;">✓</span> · #2 static <span style="color: #bf8700; font-weight: bold;">~</span> · dynamic <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Link-heavy + prefetch | #7 hover match | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| Data-heavy + cache | #13 onLoad; UI on stale ([DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) §7) | loads/DAG <span style="color: #2ea043; font-weight: bold;">✓</span> · onLoad/stale <span style="color: #cf222e; font-weight: bold;">✗</span> |

---

## Связанные документы

| Документ | О чём |
|----------|-------|
| [../../bench/README.md](../../bench/README.md) | Запуск bench-сценариев |
| `bench/reports/<id>/latest.md` | Последний отчёт по сценарию |
| [ARCHITECTURE_BENCHMARK.md](../ARCHITECTURE_BENCHMARK.md) | Сравнение с топ-роутерами |
| [DATAGRAPH_LOAD_DAG.md](../done/DATAGRAPH_LOAD_DAG.md) | Parallel loads + `ctx.parent()` — принято |
| [ATOMIC_BRANCH_COMMIT.md](../done/ATOMIC_BRANCH_COMMIT.md) | Branch resolve → sync mount |
| [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) | Пробелы DataGraph |
| [IMPLEMENTATION_STEPS.md](../IMPLEMENTATION_STEPS.md) §5b, 6b | Fast path, incremental DOM |

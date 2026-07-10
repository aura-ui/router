# TODO: консолидация архитектуры routing engine

> **Статус:** план / архитектура (не реализовано)  
> **Цель:** схлопать размазанную ответственность `navigateTo()` в явные модули с понятными границами; улучшить читаемость и поддерживаемость без big-bang rewrite.  
> **См. также:** [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md), [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md), [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md), [EVENT_BUS.md](./EVENT_BUS.md)

---

## TL;DR

| Слой (целевой) | Схлопывает as-is |
|----------------|------------------|
| **NavigationIntentResolver** | parse URL, hash-only, match, route-attr redirect, planner noop |
| **NavigationRunManager + Run** | coordinator, planner, job, rollback scope |
| **NavigationOutcomeHandler** | finalize, finalizeFailure, terminal history, redirect schedule |
| **RedirectResolver** | рекурсивный redirect → collapse loop |
| **ViewCommitOrchestrator** | render/stage/promote в pipeline + fast-path + rollback |
| **NotFoundPipeline** | pre-match NOT_FOUND path |
| **PipelineManifest** | PHASES + MAIN_PIPELINE в одном месте |
| **NavigationScroll** | scroll policy, hash, restore/top |
| **LifecycleContextFactory** | stub ctx в not-found / fast-path |
| **RouterEngineBridge** | callback matrix в aura-router |

---

## Проблема (as-is)

Один `navigateTo()` затрагивает **~15 модулей** до aura-router:

```text
AuraRoutingEngine.navigateTo()
  ├─ resolveDocumentHrefParts, isHashOnlyChange, finalizeAnchorNavigation
  ├─ resolveNavigationTarget + registry
  ├─ NOT_FOUND: not-found-exit-cleanup → finalizeNotFound → finalizeFailure
  └─ matched: NavigationCoordinator
       ├─ NavigationPlanner (+ reenter-work)
       ├─ AuraRoutingProcessor
       │    ├─ jobManager, transaction-scope, ViewCommitTracker
       │    ├─ runFastPath  ║  ProcessorPipeline
       │    └─ PHASES vs MAIN_PIPELINE (два registry)
       ├─ applyCommitGate (success history, scroll hash)
       └─ finalizeProcessorNavigation (cancel/error/redirect)

AuraRouter.ensureEngine()
  └─ callbacks → DOM events, ScrollRestoration, NotFoundController
```

**Cross-cutting без единого владельца:**

- transaction state (job, view tracker, pending href, `prev`)
- history commit timing (success sync vs terminal async)
- view commit (pipeline / fast-path / rollback — три копии)
- scroll (engine + commit-gate + aura-router)
- failure (error-phase-handler, failure/*, engine, DOM)
- match (navigateTo + prefetch plan)

---

## Целевая архитектура

```text
navigateTo(href)
  │
  ├─ NavigationIntentResolver.resolve(href, ctx)
  │     hash-only │ redirect-attr │ not-found │ noop │ run{from,to}
  │
  ├─ [not-found] NotFoundPipeline.handle → OutcomeHandler
  │
  └─ [run] NavigationRunManager.start(intent)
         │
         ├─ NavigationRun.execute()
         │     RedirectResolver.resolve()     // collapse, optional
         │     ProcessorPipeline / FastPath
         │     ViewCommitOrchestrator           // stage → promote → commitGate
         │
         └─ NavigationOutcomeHandler.apply(outcome)
               history terminal, telemetry, DOM bridge, scheduleNavigate

AuraRouter: RouterEngineBridge → AuraRoutingEngineConfig
```

**Границы:**

| Компонент | Владеет | Не владеет |
|-----------|---------|------------|
| **IntentResolver** | URL → intent до processor | hooks, DOM |
| **RunManager** | dedupe, supersede, active run | match rules |
| **Run** | job, tracker, rollback, execute | terminal callbacks |
| **OutcomeHandler** | terminal side effects | pipeline steps |
| **Processor** | guards → loads → render | navigateTo entry |
| **ViewCommitOrchestrator** | view lifecycle | history URL |
| **Router bridge** | engine config from host | pipeline |

---

## Уже описано в других документах (не дублировать)

| Документ | Слой |
|----------|------|
| [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md) | Run, Manager, OutcomeHandler, deps, telemetry |
| [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) | RedirectResolver, redirect sources, collapse |
| [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md) | thenable runner, fast path tiers |
| [EVENT_BUS.md](./EVENT_BUS.md) | observability bus |
| [INCREMENTAL_RENDER.md](./INCREMENTAL_RENDER.md) | Renderer / patch (потребитель ViewCommitOrchestrator) |

Этот документ — **дополнительные** модули и **порядок** внедрения всего roadmap.

---

## Новые модули (детали)

### 1. `NavigationIntentResolver` ⭐ приоритет

**Проблема:** решение «что делать с URL» в engine, planner, prefetch, (будущий) route redirect — разные entry points.

**Модуль:** `core/navigation/navigation-intent-resolver.ts`

```ts
type NavigationIntent =
  | { kind: 'hash-only'; href: string; hash: string }
  | { kind: 'redirect'; url: string; replace?: boolean; source: 'route-attr' }
  | { kind: 'not-found'; href: string }
  | { kind: 'noop'; reason: 'already-active' | 'duplicate-pending' }
  | { kind: 'run'; href: string; from: MatchedRouteInfo | null; to: MatchedRouteInfo; action: HistoryAction };

resolveIntent(href, ctx: { prev; action; matcher; registry }): NavigationIntent
```

**Поглощает логику из:**

- `aura-routing-engine.ts` — parse, hash-only branch, match
- `navigation-planner.ts` — noop rules (или planner становится thin filter поверх `run` intent)
- `reenter-work.ts` — same-target check
- `prefetch/plan.ts` — shared match helper
- `resolve-navigation-target.ts` — route-attr redirect ([REDIRECT_CHAIN_COLLAPSE](./REDIRECT_CHAIN_COLLAPSE.md))

**Критерий:** prefetch и navigateTo матчат одинаково; один тест-набор intent cases.

---

### 2. `ViewCommitOrchestrator` ⭐ приоритет

**Проблема:** stage → promote → commitGate дублируется в pipeline, fast-path, rollback размазан по scope.

**Модуль:** `core/view-mount/view-commit-orchestrator.ts`

```ts
interface ViewCommitOrchestrator {
  stageEnterRoutes(routes, ctx): Promise<ViewCommitResult>;
  promoteAndCommitGate(ctx): void;   // sync: commitStagedView + commitSuccess deps
  rollbackUncommitted(plan, tracker): void;
}
```

**Поглощает:**

- `runRender` + `commitEnterViews` sequences из `processor-pipeline.ts`
- `run-fast-path.ts` render/commit block
- вызовы из `transaction-scope` → `NavigationRun.rollback`

**Критерий:** fast-path и full path используют orchestrator; supersede rollback без регрессий.

**Связь:** [INCREMENTAL_RENDER.md](./INCREMENTAL_RENDER.md) — Renderer plug-in внутрь orchestrator.

---

### 3. `NotFoundPipeline`

**Проблема:** NOT_FOUND — 4+ файла + aura-router controller.

**Модуль:** `core/navigation/not-found-pipeline.ts`

```ts
handleNotFound(input: { href; prev; action }): NavigationRunOutcome
```

**Внутри:**

- `runNotFoundExitCleanup`
- `FailedNavigation.notFound`
- делегирование в `NavigationOutcomeHandler` (history, callbacks, recovery)

**Engine `navigateTo`:** `intent.kind === 'not-found'` → один вызов.

**Aura-router:** только bridge `onNotFound` → DOM + controller.

---

### 4. `PipelineManifest`

**Проблема:** порядок шагов в `processor-pipeline.ts`, policy в `lifecycle/phase-registry.ts`.

**Модуль:** расширить `phase-registry.ts` или `core/processor/pipeline-manifest.ts`

```ts
interface PipelinePhaseEntry {
  phase: RoutePhase;
  slot: 'guards' | 'loads' | 'render' | 'after' | 'transition';
  renderOrder?: TransitionOrderType;
  // …existing PHASES fields
}

const PIPELINE_MANIFEST: PipelinePhaseEntry[];
```

**Поглощает:** `MAIN_PIPELINE`, `RENDER_ORDER_STEPS`, switch `PipelineStepName`.

**Польза:** `runBlockingOnly` = filter `slot !== 'render' && slot !== 'after'`.

---

### 5. `NavigationScroll`

**Проблема:** scroll policy, hash scroll, restore/top — engine + router.

**Модуль:** `core/navigation/navigation-scroll.ts`

```ts
handleNavigationScroll(ctx: NavigationCommittedContext, policy: ScrollPolicy): void
```

**Поглощает:**

- `scrollToHash` из engine / commit-gate
- `ScrollRestoration` logic (aura-router → engine или subscribe)

**Критерий:** commit gate вызывает один scroll handler; router без дублирования policy.

---

### 6. `LifecycleContextFactory`

**Проблема:** fake/stub `RouteLifecycleContext` в not-found cleanup и fast-path.

**Модуль:** `core/lifecycle/context/navigation-context-factory.ts`

```ts
createPhaseContext(input: {
  phase; matchedRoute; bridge: LifecycleBridge; job?; router;
}): RouteLifecycleContext
```

**Поглощает:** ad-hoc `leftContext`, `jobId: 0` stubs.

---

### 7. `RouterEngineBridge`

**Проблема:** `aura-router.ts` `ensureEngine()` — длинная матрица callbacks.

**Модуль:** `aura-router/core/engine-bridge.ts` (или `core/navigation/router-integration.ts`)

```ts
createRouterEngineCallbacks(host: AuraRouter): AuraRoutingEngineConfig
```

**Поглощает:** wiring onNavigationCommitted/Error/HookError/NotFound, catch-all check.

**Критерий:** `ensureEngine()` ≤ 5 строк; engine тестируется без DOM.

---

### 8. `NavigationFailureService` (опционально, фаза 2+)

**Проблема:** `ErrorPhaseHandler` создаётся в lifecycle-runner, data-graph, fast-path отдельно.

**Модуль:** `core/failure/navigation-failure-service.ts` — один instance на processor, в `PipelineContext`.

**Не делать**, если `NavigationOutcomeHandler` + единый `ErrorPhaseHandler` в runner закрывают дублирование.

---

## Порядок внедрения (incremental)

```text
Фаза 0  NavigationIntentResolver + NotFoundPipeline
          ↓ navigateTo читается linear
Фаза 1  NavigationOutcomeHandler (+ deps commitSuccess closure)
          ↓ terminal paths в одном месте
Фаза 2  NavigationRun + NavigationRunManager
          ↓ coordinator/planner/scope → run
Фаза 3  ViewCommitOrchestrator
          ↓ pipeline + fast-path unified
Фаза 4  RedirectResolver (collapse) + route redirect attr
          ↓ см. REDIRECT_CHAIN_COLLAPSE.md
Фаза 5  PipelineManifest + runBlockingOnly filter
Фаза 6  NavigationScroll + LifecycleContextFactory
Фаза 7  RouterEngineBridge + EventBus telemetry
Фаза 8  Pipeline thenable runner + fast path Tier 1 (PIPELINE_STEP_RUNNER)
```

Каждая фаза: поведение 1:1, тесты зелёные, старый код deprecated → удаление.

---

## Фазы: файлы и критерии

### Фаза 0 — Intent + NOT_FOUND

| Файл | Действие |
|------|----------|
| `core/navigation/navigation-intent-resolver.ts` | новый |
| `core/navigation/not-found-pipeline.ts` | новый |
| `core/aura-routing-engine.ts` | `navigateTo` → resolver |
| `core/match/resolve-navigation-target.ts` | redirect attr (заготовка) |
| `prefetch/plan.ts` | shared match из resolver helper |

**Критерий:** один набор тестов intent; NOT_FOUND path — один вызов.

---

### Фаза 1 — OutcomeHandler

| Файл | Действие |
|------|----------|
| `core/navigation/navigation-outcome-handler.ts` | новый |
| `core/navigation/finalize.ts` | thin / deprecated |
| `core/failure/finalize-failure.ts` | логика → handler |

**Критерий:** cancel / error / redirect / success terminal — через handler.

---

### Фаза 2 — Run + Manager

См. [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md) фазы 1–2.

---

### Фаза 3 — ViewCommitOrchestrator

| Файл | Действие |
|------|----------|
| `core/view-mount/view-commit-orchestrator.ts` | новый |
| `core/processor/processor-pipeline.ts` | delegate render/commit |
| `core/processor/fast-path/run-fast-path.ts` | delegate |
| `core/view-mount/view-commit-render.ts` | adapter inside orchestrator |

**Критерий:** нет дублирования promote+commitGate между pipeline и fast-path.

---

### Фаза 4 — Redirect collapse

См. [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md).

---

### Фаза 5 — PipelineManifest

| Файл | Действие |
|------|----------|
| `core/processor/pipeline-manifest.ts` | новый (или extend phase-registry) |
| `core/processor/processor-pipeline.ts` | iterate manifest |

**Критерий:** `runBlockingOnly` без дублирования step list.

---

### Фаза 6 — Scroll + Context factory

| Файл | Действие |
|------|----------|
| `core/navigation/navigation-scroll.ts` | новый |
| `core/lifecycle/context/navigation-context-factory.ts` | новый |
| `aura-router/core/scroll-restoration.ts` | thin / deprecated |

---

### Фаза 7 — Router bridge + EventBus

| Файл | Действие |
|------|----------|
| `aura-router/core/engine-bridge.ts` | новый |
| `core/event-bus.ts` | см. EVENT_BUS.md |

---

## Маппинг as-is → to-be (сводный)

| As-is | To-be |
|-------|-------|
| `engine.navigateTo` match/hash branches | `NavigationIntentResolver` |
| `NavigationPlanner` | `RunManager.plan` (+ intent noop) |
| `NavigationCoordinator` | `RunManager` + `NavigationRun` |
| `withCancelledTransactionScope` | `NavigationRun.rollback` |
| `finalize*` + `finalizeFailure` | `NavigationOutcomeHandler` |
| `not-found-exit-cleanup` + engine NOT_FOUND | `NotFoundPipeline` |
| `runRender` / fast-path commit | `ViewCommitOrchestrator` |
| `PHASES` + `MAIN_PIPELINE` | `PipelineManifest` |
| `scrollToHash` + `ScrollRestoration` | `NavigationScroll` |
| stub lifecycle ctx | `LifecycleContextFactory` |
| `ensureEngine` callbacks | `RouterEngineBridge` |
| recursive redirect | `RedirectResolver` |

---

## Что не делать

- Big-bang rewrite — только incremental фазы с 1:1 behavior.
- FIFO queue navigations — latest-wins сохраняем.
- God `Engine` class — логика в named modules, engine = wiring + I/O.
- Port-adapter на каждый deps — см. [NAVIGATION_RUN_MANAGER § Deps](./NAVIGATION_RUN_MANAGER.md#deps-navigationrun).
- EventBus до стабилизации Run/Outcome — иначе emit-точки снова разъедутся.

---

## Метрики готовности (dev)

- [ ] `navigateTo` body < ~40 строк (delegation only)
- [ ] один test file `navigation-intent.test.ts` покрывает hash / noop / not-found / run
- [ ] fast-path и full-path share ViewCommitOrchestrator
- [ ] нет прямых `finalizeProcessorNavigation` вне OutcomeHandler
- [ ] aura-router `ensureEngine` без business logic

---

## Связанные документы

- [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md)
- [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md)
- [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md)
- [EVENT_BUS.md](./EVENT_BUS.md)
- [INCREMENTAL_RENDER.md](./INCREMENTAL_RENDER.md)
- [NAVIGATION_TRANSACTION_MODEL.md](../NAVIGATION_TRANSACTION_MODEL.md)
- [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md)

---

## Итог

Консолидация engine — не один класс, а **цепочка named modules** с явным потоком:

**Intent → (NotFound | Run) → Outcome**, внутри run — **Redirect resolve + Pipeline + ViewCommit**.

Начинать с **NavigationIntentResolver** и **OutcomeHandler** — максимальный выигрыш в читаемости `navigateTo` при минимальном риске.

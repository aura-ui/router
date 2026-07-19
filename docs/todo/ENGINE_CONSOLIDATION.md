# TODO: консолидация архитектуры routing engine

> **Статус:** <span style="color: #bf8700; font-weight: bold;">~</span> частично · coordinator + pipeline + redirect collapse в коде; named modules (Intent / Outcome / ViewCommit / Bridge) — осталось  
> **Сверка с кодом:** 2026-07-19  
> **Актуальный as-is:** [MAIN_PIPELINE.md](../MAIN_PIPELINE.md), [ROUTING_ENGINE.md](../ROUTING_ENGINE.md)  
> **Цель (остаток):** дальше схлопать границы модулей без big-bang rewrite.  
> **См. также:** [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md), [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md), [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md), [EVENT_BUS.md](./EVENT_BUS.md)

**Легенда:** <span style="color: #2ea043; font-weight: bold;">✓</span> сделано · <span style="color: #bf8700; font-weight: bold;">~</span> частично (поведение есть / другое имя) · <span style="color: #cf222e; font-weight: bold;">✗</span> не сделано

---

## Статус реализации (сводка)

| Слой (целевой) | Факт в коде | Статус |
|----------------|-------------|--------|
| **NavigationIntentResolver** | hash-only в `navigateTo`; match/noop в coordinator/planner — единого resolver нет | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **NavigationRunManager + Run** | `NavigationCoordinator` + `NavigationTransaction` | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **Terminal apply** | `applyNavigationOutcome` / `applyPreMatchFailure` · host `applyTerminalOutcome` | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **RedirectResolver** | `followRedirectsWithGuardWalk` — `core/redirect/redirect-resolver.ts` | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **ViewCommitOrchestrator** | `view-commit-render` / tracker / rollback — без единого orchestrator | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **NotFoundPipeline** | `not-found-exit-cleanup` + `handleUnmatchedNavigation` на engine | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **PipelineManifest** | `PHASES` / `PIPELINE_PHASES` в `lifecycle-phases.ts`; шаги pipeline отдельно | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **NavigationScroll** | `scrollToHash` в engine; `ScrollRestoration` в aura-router | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **LifecycleContextFactory** | ad-hoc stub ctx в not-found / fast-path | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **RouterEngineBridge** | `ensureEngine()` — длинная матрица callbacks в `aura-router.ts` | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **NavigationFailureService** | опционально; failure handlers размазаны | <span style="color: #cf222e; font-weight: bold;">✗</span> (опц.) |
| **EventBus telemetry** | точечные DOM/callbacks; bus нет | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **Pipeline thenable runner** | см. [PIPELINE_STEP_RUNNER](./PIPELINE_STEP_RUNNER.md) | <span style="color: #2ea043; font-weight: bold;">✓</span> |

### Фазы внедрения

| Фаза | Содержание | Статус |
|------|------------|--------|
| **0** | IntentResolver + NotFoundPipeline | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **1** | Terminal apply (`applyNavigationOutcome`) | <span style="color: #2ea043; font-weight: bold;">✓</span> функции (без class) |
| **2** | Run + RunManager (rename/split) | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **3** | ViewCommitOrchestrator | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **4** | RedirectResolver collapse | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **5** | PipelineManifest + `runBlockingOnly` filter | <span style="color: #bf8700; font-weight: bold;">~</span> PHASES · <span style="color: #cf222e; font-weight: bold;">✗</span> единый manifest |
| **6** | NavigationScroll + LifecycleContextFactory | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **7** | RouterEngineBridge + EventBus | <span style="color: #cf222e; font-weight: bold;">✗</span> / <span style="color: #bf8700; font-weight: bold;">~</span> |
| **8** | Pipeline thenable + dom-cache fast path | <span style="color: #2ea043; font-weight: bold;">✓</span> thenable + `canUseDomCacheFastPath` |

---

## TL;DR

| Слой (целевой) | Схлопывает as-is | Статус |
|----------------|------------------|--------|
| **NavigationIntentResolver** | parse URL, hash-only, match, route-attr redirect, planner noop | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **NavigationRunManager + Run** | coordinator, planner, job, rollback scope | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **NavigationOutcomeHandler** | finalize, finalizeFailure, terminal history, redirect schedule | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **RedirectResolver** | рекурсивный redirect → collapse loop | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **ViewCommitOrchestrator** | render/stage/promote в pipeline + fast-path + rollback | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **NotFoundPipeline** | pre-match NOT_FOUND path | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **PipelineManifest** | PHASES + MAIN_PIPELINE в одном месте | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **NavigationScroll** | scroll policy, hash, restore/top | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **LifecycleContextFactory** | stub ctx в not-found / fast-path | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **RouterEngineBridge** | callback matrix в aura-router | <span style="color: #cf222e; font-weight: bold;">✗</span> |

---

## Проблема (as-is → сейчас)

**Было (legacy-картина до консолидации):** один `navigateTo()` затрагивал **~15 модулей**.

**Сейчас в коде:**

```text
AuraRoutingEngine.navigateTo()                    ✓ уже thin (hash-only → coordinator)
  ├─ resolveDocumentHrefParts, isHashOnlyChange   ~ не IntentResolver
  ├─ finalizeAnchorNavigation + scrollToHash      ✗ NavigationScroll
  └─ NavigationCoordinator.navigate()             ~ RunManager
       ├─ followRedirectsWithGuardWalk            ✓ RedirectResolver
       ├─ handleUnmatchedNavigation (host)        ~ NotFoundPipeline
       ├─ NavigationCoordinator.plan              ✓ dedupe/noop
       ├─ NavigationTransaction                   ✓ Run (другое имя)
       │    ├─ ViewCommitTracker, rollback        ✓
       │    ├─ runFastPipeline ║ Pipeline         ~ без ViewCommitOrchestrator
       │    └─ PHASES vs step list                ~ без PipelineManifest
       └─ processResult → finalize* / applyRedirect  ~ OutcomeHandler размазан

AuraRouter.ensureEngine()                         ✗ RouterEngineBridge
  └─ callbacks → DOM events, ScrollRestoration, NotFoundController
```

**Cross-cutting без единого владельца (ещё болит):**

- <span style="color: #bf8700; font-weight: bold;">~</span> transaction state — в `NavigationTransaction`, но deps = весь engine
- <span style="color: #bf8700; font-weight: bold;">~</span> history commit timing — success sync vs terminal async
- <span style="color: #cf222e; font-weight: bold;">✗</span> view commit — pipeline / fast-path без общего orchestrator
- <span style="color: #cf222e; font-weight: bold;">✗</span> scroll — engine + aura-router
- <span style="color: #bf8700; font-weight: bold;">~</span> failure — finalize + failure/* + DOM
- <span style="color: #cf222e; font-weight: bold;">✗</span> match — нет shared IntentResolver для navigate + prefetch

---

## Целевая архитектура

```text
navigateTo(href)
  │
  ├─ NavigationIntentResolver.resolve(href, ctx)     ✗
  │     hash-only │ redirect-attr │ not-found │ noop │ run{from,to}
  │
  ├─ [not-found] NotFoundPipeline.handle → Outcome   ~
  │
  └─ [run] NavigationRunManager.start(intent)        ~
         │
         ├─ NavigationRun.execute()                  ✓ как NavigationTransaction
         │     RedirectResolver.resolve()            ✓ followRedirectsWithGuardWalk
         │     NavigationTransactionPipeline / Fast  ✓
         │     ViewCommitOrchestrator                ✗
         │
         └─ NavigationOutcomeHandler.apply(outcome)  ~
               history terminal, telemetry, DOM bridge, scheduleNavigate

AuraRouter: RouterEngineBridge → AuraRoutingEngineConfig   ✗
```

**Границы:**

| Компонент | Владеет | Не владеет | Статус |
|-----------|---------|------------|--------|
| **IntentResolver** | URL → intent до processor | hooks, DOM | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **RunManager** | dedupe, supersede, active run | match rules | <span style="color: #bf8700; font-weight: bold;">~</span> `NavigationCoordinator` |
| **Run** | job, tracker, rollback, execute | terminal callbacks | <span style="color: #2ea043; font-weight: bold;">✓</span> `NavigationTransaction` |
| **OutcomeHandler** | terminal side effects | pipeline steps | <span style="color: #bf8700; font-weight: bold;">~</span> |
| **Processor** | guards → loads → render | navigateTo entry | <span style="color: #2ea043; font-weight: bold;">✓</span> Pipeline |
| **ViewCommitOrchestrator** | view lifecycle | history URL | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **RedirectResolver** | collapse pre-commit | full pipeline | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **Router bridge** | engine config from host | pipeline | <span style="color: #cf222e; font-weight: bold;">✗</span> |

---

## Уже описано в других документах (не дублировать)

| Документ | Слой | Статус дока |
|----------|------|-------------|
| [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md) | Run, Manager, OutcomeHandler, deps, telemetry | <span style="color: #bf8700; font-weight: bold;">~</span> |
| [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) | RedirectResolver, redirect sources, collapse | <span style="color: #2ea043; font-weight: bold;">✓</span> guard/leave + declarative |
| [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md) | thenable runner, fast path tiers | <span style="color: #2ea043; font-weight: bold;">✓</span> thenable + `canUseDomCacheFastPath` |
| [EVENT_BUS.md](./EVENT_BUS.md) | observability bus | <span style="color: #bf8700; font-weight: bold;">~</span> |
| [INCREMENTAL_RENDER.md](./INCREMENTAL_RENDER.md) | Renderer / patch (потребитель ViewCommitOrchestrator) | см. док |

Этот документ — **дополнительные** модули и **порядок** внедрения всего roadmap.

---

## Новые модули (детали)

### 1. `NavigationIntentResolver` ⭐ приоритет — <span style="color: #cf222e; font-weight: bold;">✗ не сделано</span>

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

### 2. `ViewCommitOrchestrator` ⭐ приоритет — <span style="color: #cf222e; font-weight: bold;">✗ не сделано</span>

**Проблема:** stage → promote → commitGate дублируется в pipeline, fast-path, rollback размазан по scope.

**Модуль:** `core/view-mount/view-commit-orchestrator.ts`

```ts
interface ViewCommitOrchestrator {
  stageEnterRoutes(routes, ctx): Promise<ViewCommitResult>;
  promoteAndCommitGate(ctx): void;   // sync: commitStagedView + commitSuccess deps
  rollbackUncommitted(plan, tracker): void;
}
```

**Уже есть рядом (не orchestrator):** <span style="color: #2ea043; font-weight: bold;">✓</span> `view-commit-render.ts`, `view-commit-tracker.ts`, rollback в `NavigationTransaction`.

**Поглощает:**

- `runRender` + `commitEnterViews` sequences из pipeline
- `runFastPipeline` render/commit block
- вызовы rollback → `NavigationRun.rollback`

**Критерий:** fast-path и full path используют orchestrator; supersede rollback без регрессий.

**Связь:** [INCREMENTAL_RENDER.md](./INCREMENTAL_RENDER.md) — Renderer plug-in внутрь orchestrator.

---

### 3. `NotFoundPipeline` — <span style="color: #bf8700; font-weight: bold;">~ частично</span>

**Проблема:** NOT_FOUND — 4+ файла + aura-router controller.

**Модуль:** `core/navigation/not-found-pipeline.ts` — <span style="color: #cf222e; font-weight: bold;">✗</span> файла нет.

**Уже в коде:**

- <span style="color: #2ea043; font-weight: bold;">✓</span> `runNotFoundExitCleanup`
- <span style="color: #2ea043; font-weight: bold;">✓</span> `FailedNavigation.notFound`
- <span style="color: #bf8700; font-weight: bold;">~</span> `handleUnmatchedNavigation` на engine (не один pipeline-модуль)

```ts
handleNotFound(input: { href; prev; action }): NavigationRunOutcome
```

**Внутри (цель):** cleanup + failure + делегирование в `NavigationOutcomeHandler`.

**Engine `navigateTo`:** `intent.kind === 'not-found'` → один вызов.

**Aura-router:** только bridge `onNotFound` → DOM + controller.

---

### 4. `PipelineManifest` — <span style="color: #bf8700; font-weight: bold;">~ частично</span>

**Проблема:** порядок шагов в pipeline, policy в `lifecycle-phases.ts`.

**Уже в коде:** <span style="color: #2ea043; font-weight: bold;">✓</span> `PHASES` + `PIPELINE_PHASES` в `lifecycle-phases.ts`.  
**Нет:** <span style="color: #cf222e; font-weight: bold;">✗</span> единого manifest со `slot` (`guards` / `loads` / `render` / …), из которого строится и full, и blocking-only.

**Модуль:** расширить phase-registry или `core/processor/pipeline-manifest.ts`

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
**Факт:** blocking walk уже есть как `runGuards` / redirect walk — без filter от manifest.

---

### 5. `NavigationScroll` — <span style="color: #cf222e; font-weight: bold;">✗ не сделано</span>

**Проблема:** scroll policy, hash scroll, restore/top — engine + router.

**Модуль:** `core/navigation/navigation-scroll.ts`

```ts
handleNavigationScroll(ctx: NavigationCommittedContext, policy: ScrollPolicy): void
```

**Поглощает:**

- `scrollToHash` из engine / commit path
- `ScrollRestoration` logic (aura-router → engine или subscribe)

**Критерий:** commit gate вызывает один scroll handler; router без дублирования policy.

---

### 6. `LifecycleContextFactory` — <span style="color: #cf222e; font-weight: bold;">✗ не сделано</span>

**Проблема:** fake/stub `RouteLifecycleContext` в not-found cleanup и fast-path.

**Модуль:** `core/lifecycle/context/navigation-context-factory.ts`

```ts
createPhaseContext(input: {
  phase; matchedRoute; bridge: LifecycleBridge; job?; router;
}): RouteLifecycleContext
```

**Поглощает:** ad-hoc `leftContext`, `jobId: 0` stubs.

---

### 7. `RouterEngineBridge` — <span style="color: #cf222e; font-weight: bold;">✗ не сделано</span>

**Проблема:** `aura-router.ts` `ensureEngine()` — длинная матрица callbacks.

**Модуль:** `aura-router/core/engine-bridge.ts` (или `core/navigation/router-integration.ts`)

```ts
createRouterEngineCallbacks(host: AuraRouter): AuraRoutingEngineConfig
```

**Поглощает:** wiring onNavigationCommitted/Error/HookError/NotFound, catch-all check.

**Критерий:** `ensureEngine()` ≤ 5 строк; engine тестируется без DOM.

---

### 8. `NavigationFailureService` (опционально, фаза 2+) — <span style="color: #cf222e; font-weight: bold;">✗ не сделано</span>

**Проблема:** `ErrorPhaseHandler` создаётся в lifecycle-runner, data-graph, fast-path отдельно.

**Модуль:** `core/failure/navigation-failure-service.ts` — один instance на processor, в `PipelineContext`.

**Не делать**, если `NavigationOutcomeHandler` + единый `ErrorPhaseHandler` в runner закрывают дублирование.

---

## Порядок внедрения (incremental)

```text
Фаза 0  NavigationIntentResolver + NotFoundPipeline          ✗
          ↓ navigateTo читается linear
Фаза 1  NavigationOutcomeHandler (+ deps commitSuccess)      ~ / ✗ класс
          ↓ terminal paths в одном месте
Фаза 2  NavigationRun + NavigationRunManager                 ~ (Transaction / Coordinator)
          ↓ coordinator/planner/scope → run
Фаза 3  ViewCommitOrchestrator                               ✗
          ↓ pipeline + fast-path unified
Фаза 4  RedirectResolver (collapse) + route redirect attr    ✓
          ↓ см. REDIRECT_CHAIN_COLLAPSE.md
Фаза 5  PipelineManifest + runBlockingOnly filter            ~
Фаза 6  NavigationScroll + LifecycleContextFactory           ✗
Фаза 7  RouterEngineBridge + EventBus telemetry              ✗ / ~
Фаза 8  Pipeline thenable + canUseDomCacheFastPath           ✓
```

Каждая фаза: поведение 1:1, тесты зелёные, старый код deprecated → удаление.

---

## Фазы: файлы и критерии

### Фаза 0 — Intent + NOT_FOUND — <span style="color: #cf222e; font-weight: bold;">✗</span>

| Файл | Действие | Статус |
|------|----------|--------|
| `core/navigation/navigation-intent-resolver.ts` | новый | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `core/navigation/not-found-pipeline.ts` | новый | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `core/aura-routing-engine.ts` | `navigateTo` → resolver | <span style="color: #bf8700; font-weight: bold;">~</span> thin, без resolver |
| `core/match/resolve-navigation-target.ts` | redirect attr | <span style="color: #2ea043; font-weight: bold;">✓</span> в redirect walk |
| `prefetch/plan.ts` | shared match из resolver helper | <span style="color: #cf222e; font-weight: bold;">✗</span> |

**Критерий:** один набор тестов intent; NOT_FOUND path — один вызов.

---

### Фаза 1 — OutcomeHandler — <span style="color: #bf8700; font-weight: bold;">~</span>

| Файл | Действие | Статус |
|------|----------|--------|
| `core/navigation/navigation-outcome-handler.ts` | новый `apply()` | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `core/navigation/navigation-finalize.ts` | thin / deprecated | <span style="color: #bf8700; font-weight: bold;">~</span> живой модуль |
| `core/failure/finalize-failure.ts` | логика → handler | <span style="color: #bf8700; font-weight: bold;">~</span> |

**Критерий:** cancel / error / redirect / success terminal — через handler.  
**Факт:** terminal есть (`finalizeCancelled` / `finalizeError` / `applyRedirect` / `finalizeResolveTerminal`), единого `apply(outcome)` нет.

---

### Фаза 2 — Run + Manager — <span style="color: #bf8700; font-weight: bold;">~</span>

См. [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md) фазы 1–2.

| Целевое | Факт | Статус |
|---------|------|--------|
| `NavigationRun` | `NavigationTransaction` | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| `NavigationRunManager` | `NavigationCoordinator` (без rename) | <span style="color: #bf8700; font-weight: bold;">~</span> |
| rollback scope | `runWithStagedViewRollback` | <span style="color: #2ea043; font-weight: bold;">✓</span> |

---

### Фаза 3 — ViewCommitOrchestrator — <span style="color: #cf222e; font-weight: bold;">✗</span>

| Файл | Действие | Статус |
|------|----------|--------|
| `core/view-mount/view-commit-orchestrator.ts` | новый | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `core/navigation/navigation-transaction-pipeline.ts` | delegate render/commit | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `runFastPipeline` | delegate | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `core/view-mount/view-commit-render.ts` | adapter inside orchestrator | <span style="color: #2ea043; font-weight: bold;">✓</span> существует отдельно |

**Критерий:** нет дублирования promote+commitGate между pipeline и fast-path.

---

### Фаза 4 — Redirect collapse — <span style="color: #2ea043; font-weight: bold;">✓ сделано</span>

См. [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md).

| Факт | Статус |
|------|--------|
| `core/redirect/redirect-resolver.ts` (`followRedirectsWithGuardWalk`) | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| guard/leave + declarative collapse | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| redirect из `load` | <span style="color: #2ea043; font-weight: bold;">✓</span> убран по политике (не backlog) |
| вызов из `NavigationCoordinator` | <span style="color: #2ea043; font-weight: bold;">✓</span> |

---

### Фаза 5 — PipelineManifest — <span style="color: #bf8700; font-weight: bold;">~</span>

| Файл | Действие | Статус |
|------|----------|--------|
| `core/processor/pipeline-manifest.ts` | новый (или extend phase-registry) | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `lifecycle-phases.ts` (`PHASES`) | policy registry | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| `navigation-transaction-pipeline.ts` | iterate manifest | <span style="color: #cf222e; font-weight: bold;">✗</span> still hand-wired steps |

**Критерий:** `runBlockingOnly` без дублирования step list.

---

### Фаза 6 — Scroll + Context factory — <span style="color: #cf222e; font-weight: bold;">✗</span>

| Файл | Действие | Статус |
|------|----------|--------|
| `core/navigation/navigation-scroll.ts` | новый | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `core/lifecycle/context/navigation-context-factory.ts` | новый | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `aura-router/core/scroll-restoration.ts` | thin / deprecated | <span style="color: #bf8700; font-weight: bold;">~</span> живой модуль |

---

### Фаза 7 — Router bridge + EventBus — <span style="color: #cf222e; font-weight: bold;">✗</span> / <span style="color: #bf8700; font-weight: bold;">~</span>

| Файл | Действие | Статус |
|------|----------|--------|
| `aura-router/core/engine-bridge.ts` | новый | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `core/event-bus.ts` | см. EVENT_BUS.md | <span style="color: #cf222e; font-weight: bold;">✗</span> bus · <span style="color: #bf8700; font-weight: bold;">~</span> DOM/callbacks |

---

## Маппинг as-is → to-be (сводный)

| As-is | To-be | Статус |
|-------|-------|--------|
| `engine.navigateTo` match/hash branches | `NavigationIntentResolver` | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `NavigationCoordinator.plan` | `RunManager.plan` (+ intent noop) | <span style="color: #2ea043; font-weight: bold;">✓</span> plan есть |
| `NavigationCoordinator` | `RunManager` + `NavigationRun` | <span style="color: #bf8700; font-weight: bold;">~</span> имена другие |
| `withCancelledTransactionScope` | `NavigationRun.rollback` | <span style="color: #2ea043; font-weight: bold;">✓</span> в transaction |
| `finalize*` + `finalizeFailure` | `NavigationOutcomeHandler` | <span style="color: #bf8700; font-weight: bold;">~</span> |
| `not-found-exit-cleanup` + engine NOT_FOUND | `NotFoundPipeline` | <span style="color: #bf8700; font-weight: bold;">~</span> |
| `runRender` / fast-path commit | `ViewCommitOrchestrator` | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `PHASES` + `MAIN_PIPELINE` | `PipelineManifest` | <span style="color: #bf8700; font-weight: bold;">~</span> |
| `scrollToHash` + `ScrollRestoration` | `NavigationScroll` | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| stub lifecycle ctx | `LifecycleContextFactory` | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| `ensureEngine` callbacks | `RouterEngineBridge` | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| recursive redirect | `RedirectResolver` | <span style="color: #2ea043; font-weight: bold;">✓</span> |

---

## Что не делать

- Big-bang rewrite — только incremental фазы с 1:1 behavior.
- FIFO queue navigations — latest-wins сохраняем.
- God `Engine` class — логика в named modules, engine = wiring + I/O.
- Port-adapter на каждый deps — см. [NAVIGATION_RUN_MANAGER § Deps](./NAVIGATION_RUN_MANAGER.md#deps-navigationrun).
- EventBus до стабилизации Run/Outcome — иначе emit-точки снова разъедутся.

---

## Метрики готовности (dev)

- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> `navigateTo` body < ~40 строк (delegation only) — hash-only + `coordinator.navigate`
- [ ] <span style="color: #cf222e; font-weight: bold;">✗</span> один test file `navigation-intent.test.ts` покрывает hash / noop / not-found / run
- [ ] <span style="color: #cf222e; font-weight: bold;">✗</span> fast-path и full-path share ViewCommitOrchestrator
- [ ] <span style="color: #cf222e; font-weight: bold;">✗</span> нет прямых terminal finalize вне OutcomeHandler (`finalizeCancelled` / `finalizeError` / `applyRedirect` на engine + host)
- [ ] <span style="color: #cf222e; font-weight: bold;">✗</span> aura-router `ensureEngine` без business logic
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> Redirect collapse pre-commit (`followRedirectsWithGuardWalk`)
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> Run + rollback scope (`NavigationTransaction`)
- [x] <span style="color: #2ea043; font-weight: bold;">✓</span> Pipeline executor (`NavigationTransactionPipeline`)

---

## Связанные документы

- [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md) — <span style="color: #bf8700; font-weight: bold;">~</span>
- [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) — <span style="color: #2ea043; font-weight: bold;">✓</span>
- [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md) — <span style="color: #2ea043; font-weight: bold;">✓</span> thenable + `canUseDomCacheFastPath`
- [EVENT_BUS.md](./EVENT_BUS.md) — <span style="color: #bf8700; font-weight: bold;">~</span>
- [INCREMENTAL_RENDER.md](./INCREMENTAL_RENDER.md)
- [NAVIGATION_TRANSACTION_MODEL.md](../NAVIGATION_TRANSACTION_MODEL.md)
- [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md)

---

## Итог

Консолидация engine — не один класс, а **цепочка named modules** с явным потоком:

**Intent → (NotFound | Run) → Outcome**, внутри run — **Redirect resolve + Pipeline + ViewCommit**.

| Уже закрыто | Дальше (макс. выигрыш) |
|-------------|------------------------|
| <span style="color: #2ea043; font-weight: bold;">✓</span> Redirect collapse | <span style="color: #cf222e; font-weight: bold;">✗</span> **NavigationIntentResolver** |
| <span style="color: #2ea043; font-weight: bold;">✓</span> Transaction / Pipeline / Coordinator | <span style="color: #bf8700; font-weight: bold;">~</span> → <span style="color: #2ea043; font-weight: bold;">✓</span> **OutcomeHandler.apply()** |
| <span style="color: #2ea043; font-weight: bold;">✓</span> thin `navigateTo` | <span style="color: #cf222e; font-weight: bold;">✗</span> **ViewCommitOrchestrator** |

Начинать остаток с **NavigationIntentResolver** и **OutcomeHandler** — максимальный выигрыш в читаемости entry path при минимальном риске.

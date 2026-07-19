# TODO: Navigation orchestration (Transaction + Coordinator)

> **Статус:** <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (cleanup observe/apply) · rename / узкие deps ⊘  

> **Сверка с кодом:** 2026-07-19  
> **Связь:** консолидация слоя orchestration; redirect collapse → [../done/REDIRECT_CHAIN_COLLAPSE.md](../done/REDIRECT_CHAIN_COLLAPSE.md); [NAVIGATION_EVENTS](./NAVIGATION_EVENTS.md), [../done/EVENT_BUS.md](../done/EVENT_BUS.md), `NavigationPulse`.  
> **См. также:** [NAVIGATION_TRANSACTION_MODEL.md](../NAVIGATION_TRANSACTION_MODEL.md), [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md) (Navigation Job), [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md), [ENGINE_CONSOLIDATION.md](./ENGINE_CONSOLIDATION.md)

### Cleanup: observe vs apply (поэтапно)

| # | Шаг | Статус |
|---|-----|--------|
| **1** | Зафиксировать контракт: `NavigationPulse` = **observe only** (emit; без history/`prev`/callbacks/navigate) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **2** | Свести terminal side effects в один `apply(outcome)` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `applyNavigationOutcome` (функции, без class/deps-порта) |
| **3** | Упростить `failure/` (модель отдельно от apply side effects) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `failure/` = model |
| **4** | Схлопнуть `navigation-finalize.ts` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> файл удалён; history → `history-policy`; committed ctx → `types` |
| **5** | Выровнять все terminal paths: `settle` → apply (в т.ч. NOT_FOUND, resolve cancel/redirect) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

**Шаг 1 — зафиксировано в:** `navigation-pulse.ts` · `ARCHITECTURE.md` § Observe vs apply · `failure/README.md` · [../done/EVENT_BUS.md](../done/EVENT_BUS.md) · JSDoc `finalizeResolveTerminal` (gaps).  
**Шаг 2 —** `applyNavigationOutcome` / `applyPreMatchFailure` · host `applyTerminalOutcome` · coordinator `processResult`.  
**Шаг 3 —** `failure/` только модель; side effects в outcome-handler.  
**Шаг 4 —** `navigation-finalize.ts` удалён; `applyTransactionHistory` → `history-policy.ts`; `NavigationCommittedContext` → `navigation/types.ts`.  
**Шаг 5 —** `settle` → apply на `handleUnmatchedNavigation` / `handleRedirectError` / `finalizeResolveTerminal` / `processResult`; DOM adapter принимает `to: null`.

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | поведение в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | поведение есть, целевая форма (имя/класс/API) — нет |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> | сознательно не в scope / by design |

---

## Сводка прогресса (читай сначала)

| # | Тема | Статус | Факт в коде |
|---|------|--------|-------------|
| 1 | **NavigationRun** (транзакция одного intent) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `NavigationTransaction` — job + tracker + rollback + pipeline |
| 2 | **Dedupe + supersede + active run** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `NavigationCoordinator.plan` / `run` / `navigate` |
| 3 | **Pipeline executor** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `NavigationTransactionPipeline` |
| 4 | **Rollback uncommitted views** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `runWithStagedViewRollback` + `ViewCommitTracker` |
| 5 | **Redirect chain collapse** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `followRedirectsWithGuardWalk` до `coordinator.run` |
| 6 | **Success history commit** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `commitHistoryIfNeeded` + `commitNavigation` |
| 7 | **Terminal finalize (error/cancel/redirect/404)** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `settle` → `applyNavigationOutcome` / `applyPreMatchFailure` |
| 8 | **DOM nav events** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | start / commit / complete / cancel / redirect / errors / `not-found` — bus → aura-router |
| 9 | **Rename → `NavigationRun` / `RunManager`** | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | **не делаем** — остаются `NavigationCoordinator` + `NavigationTransaction` |
| 10 | **Terminal `apply(outcome)`** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `applyNavigationOutcome` · host `applyTerminalOutcome` |
| 11 | **Узкие deps (`commitSuccess` closure)** | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | **не делаем** — остаётся `tx.engine` без прослоек |
| 12 | **Явный run status `pending\|resolved\|rejected`** | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | косвенно: abort + `TransactionResult` |
| 13 | **EventBus / `NavigationPulse`** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `engine.events` + `engine.pulse`; см. [../done/EVENT_BUS.md](../done/EVENT_BUS.md) |
| 14 | **Ring buffer прошлых run** | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | EB4 / devtools — не блокер; см. [CACHE_DEVTOOLS](./CACHE_DEVTOOLS.md) |
| 15 | **`NavigationIntent` тип** | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | не планируется; `RedirectionContext` + resolve |
| 16 | **Отдельный класс `RedirectResolver` / `runBlockingOnly`** | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> | логика в `redirect/` + guard walk |

**Вердикт:** док **актуален как backlog консолидации API**, не как «ничего нет». Runtime-ядро (Transaction + Coordinator + collapse + pipeline + EventBus) — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>. Осталось в основном **OutcomeHandler**. Rename и узкие deps (`commitSuccess`) — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>.

---

## Статус реализации (сверка с кодом, 2026-07-19)

| Целевой модуль (док) | Факт в коде | Статус |
|----------------------|-------------|--------|
| **`NavigationRun`** | `NavigationTransaction` — `core/navigation/navigation-transaction.ts` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **`NavigationRunManager`** (имя из старого плана) | `NavigationCoordinator` — dedupe + supersede + `activeTransaction` + resolve | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> семантика · <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> rename |
| **Terminal apply** | `applyNavigationOutcome` / `applyPreMatchFailure` · host `applyTerminalOutcome` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **`NavigationCoordinator.plan()`** | `already-active`, `cancel-pending` → `run` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **Rollback scope** | `runWithStagedViewRollback()` + `rollbackUncommittedViews` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **`ViewCommitTracker`** | поле `NavigationTransaction.viewCommitTracker` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **Pipeline executor** | `NavigationTransactionPipeline` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **Redirect collapse** | `followRedirectsWithGuardWalk` в `coordinator.navigate()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **`commitSuccess` closure deps** | прямой `tx.engine` (`commitHistoryIfNeeded` / `commitNavigation`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> by design · <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> узкий deps |
| **`NavigationRunOutcome`** | `TransactionResult` + short-circuit / error types | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |
| **`NavigationIntent`** | — | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> |
| **Класс `RedirectResolver` / `resolveBlocking()` как фаза run** | функции в `redirect/`; resolve **до** pipeline в coordinator | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> поведение · <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> форма из старого плана |
| **EventBus + `NavigationPulse`** | `engine.events` / `engine.pulse`; emit из pipeline + `processResult` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **Ring buffer прошлых run** | — | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> (EB4) |
| **DOM P0 lifecycle** | start / commit / complete / cancel / redirect / errors | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **State machine `pending\|resolved\|rejected`** | abort + `TransactionResult` | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |

### Фазы внедрения

| Фаза | Статус |
|------|--------|
| **1 — Extract `NavigationRun`** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> как `NavigationTransaction` |
| **1b — terminal apply** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `applyNavigationOutcome` / `applyPreMatchFailure` |
| **2 — orchestration (`NavigationCoordinator`)** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> · rename в RunManager — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> |
| **3 — Redirect collapse** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> → [../done/REDIRECT_CHAIN_COLLAPSE.md](../done/REDIRECT_CHAIN_COLLAPSE.md) |
| **4 — Observability** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> EventBus + DOM P0 · ring buffer ⊘ EB4 |

---

## Проблема (as-is → было)

~~Одна пользовательская навигация (один клик / один `navigateTo`) сейчас размазана по нескольким сущностям:~~

**Было (до консолидации):**

```text
AuraRoutingEngine.navigateTo()
  → NavigationCoordinator.run()
       NavigationCoordinator.plan          // dedupe кликов
       NavigationTransaction.run()
         NavigationCoordinator.run() supersede       // supersede
         withCancelledTransactionScope  // rollback view
         ViewCommitTracker
         NavigationTransactionPipeline
       finalizeProcessorNavigation()    // terminal history / redirect
  commitGate (callback внутри pipeline)  // success history — sync
```

**Сейчас в коде:**

```text
AuraRoutingEngine.navigateTo()
  → match / not-found / fast-path (engine)
  → NavigationCoordinator.navigate()           ✓ dedupe attempt + followRedirectsWithGuardWalk
       plan → NavigationTransaction.run()      ✓ job + tracker + rollback
         NavigationPulse.begin / phase emits   ✓ via engine.pulse
         NavigationTransactionPipeline         ✓ guards → loads → render → ready
         commitHistoryIfNeeded / commitNavigation  ~ success history на engine
  → processResult → pulse.settle → applyTerminalOutcome  ✓ OutcomeHandler
```

**Что уже закрыто:** <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> rollback · dedupe/supersede · transaction · redirect collapse · success history · EventBus/`NavigationPulse` · DOM P0 · `applyNavigationOutcome`.

**By design / вне cleanup:**

- <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> Явный run status (`pending | resolved | rejected`) — только косвенно через abort + `TransactionResult`.

**By design (не делаем):**

- <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> Узкий `NavigationRunDeps` / `commitSuccess` — остаётся прямой `tx.engine` (без прослоек при разборе кода).

---

## Предлагаемая модель

> **Именование (финальное):** `NavigationTransaction` + `NavigationCoordinator`.  
> Ярлыки Run / RunManager ниже — только исторический маппинг из старого плана; **rename не делаем**.

### `NavigationTransaction` — одна навигационная транзакция <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

> Старый план-ярлык: `NavigationRun`.

Единица жизненного цикла **одного intent** (один клик / один `navigateTo`):

```ts
type NavigationRunStatus = 'pending' | 'resolved' | 'rejected';

interface NavigationRun {
  readonly id: number;
  readonly intent: NavigationIntent;   // ⊘ не вводим отдельный тип
  status: NavigationRunStatus;         // ✗ явного поля нет

  readonly job: NavigationTransaction;
  readonly transitionPlan: TransitionMap;
  readonly viewCommitTracker: ViewCommitTracker;

  execute(): Promise<NavigationRunOutcome>;
  abort(reason?: unknown): void;
}
```

**Внутри `execute()` (фазы одного run):**

```text
1. resolveBlocking()    // ✓ сделано ДО run: followRedirectsWithGuardWalk в coordinator.navigate
2. executeFull()        // ✓ processor / pipeline (+ NavigationPulse phase emits)
3. map TransactionResult → outcome → OutcomeHandler   // ~ pulse.settle + finalize* на engine
```

**Rollback:** <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `NavigationTransaction.runWithStagedViewRollback`.

**History и атомарность:** <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> success через engine; terminal — методы engine. Узкий `NavigationRunDeps` — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> (остаётся `tx.engine`).

| Путь | Когда history | Статус |
|------|----------------|--------|
| success | sync `commitHistoryIfNeeded` + `commitNavigation` в pipeline | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| cancelled / error | engine `finalizeCancelled` / `finalizeError` + `applyTransactionHistory` | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |
| supersede | view rollback; history для run не commit'ился; bus `navigation:cancel` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| redirect (legacy post-resolve) | `applyRedirect` → новый navigate | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| redirect (collapse) | один commit после full run на leaf | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

### `NavigationCoordinator` — orchestration <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

> Бывший план-ярлык `NavigationRunManager` — **не вводим**. Имя в коде: `NavigationCoordinator`.

**Не очередь / stack.** Семантика **latest-wins + supersede**:

```text
activeTransaction: NavigationTransaction | null

plan(input): PlanDecision
  noop | cancel-pending | run
```

Делает:

- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `plan` — dedupe;
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> abort предыдущего transaction;
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `followRedirectsWithGuardWalk` + `await activeTransaction.run()`;
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `processResult` → `pulse.settle` + host finalize.

```text
Engine.navigateTo()
  → match / not-found / fast-path
  → NavigationCoordinator.navigate()
       followRedirectsWithGuardWalk
       plan → NavigationTransaction.run()
  → processResult → pulse.settle → applyTerminalOutcome
```

### Опционально: ring buffer прошлых run <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>

Для runtime **не обязателен**. Полезен для observability (10–20 записей) — часть EB4 / [CACHE_DEVTOOLS](./CACHE_DEVTOOLS.md):

| Use case |
|----------|
| DevTools timeline |
| Debug supersede / rollback |
| Связь cancel ↔ `abortedByRunId` |

Хранить метаданные, не DOM: `{ id, href, from, status, phases, durationMs, abortedBy? }`.

---

## Deps (`NavigationTransaction`) <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> by design

`NavigationTransaction` — **внутренний** класс engine (private API).

> **Решение:** держим `engine: AuraRoutingEngine` целиком. Узкий `NavigationRunDeps` / `commitSuccess` closure — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> **не вводим** (лишняя прослойка при разборе кода).  
> Emit — через `engine.pulse` / `engine.events`.

### History

> <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `tx.engine.commitHistoryIfNeeded` + `commitNavigation` из pipeline — прямой вызов, без deps-порта.

**Terminal history** — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> через `applyNavigationOutcome` + `applyTransactionHistory` (`history-policy`).

### Что transaction берёт через `engine`

| Через `tx.engine` | Зачем | Статус |
|-------------------|-------|--------|
| `commitHistoryIfNeeded` / `commitNavigation` / `notifyUrlAligned` | history + commit | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `pulse` / `events` | telemetry | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `resourceGraph` / `viewGraph` | loads / fast path | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `router` / `hooksRegistry` / `reportNavigationHookError` | hooks | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

### Вне transaction (engine / coordinator)

| Concern | Где | Статус |
|---------|-----|--------|
| `UrlMatcher`, registry, match | Engine / coordinator resolve | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `NavigationProvider` | Engine | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Dedupe | Coordinator `plan()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Prefetch | Engine | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| EventBus + DOM CustomEvent | `engine.events` → aura-router `onEngineEvent` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

---

## EventBus и telemetry <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

> Полный контракт: [../done/EVENT_BUS.md](../done/EVENT_BUS.md).  
> Emit-порт в коде — **`NavigationPulse`** (`engine.pulse`), не отдельный `{ emit }` в deps transaction.

### Как устроено

```text
AuraRoutingEngine
  events: EventBus
  pulse: NavigationPulse(events)
       ↓
NavigationTransaction / Pipeline / Coordinator.processResult
  pulse.begin | prepare* | load* | alignUrl | commit* | settle
       ↓
aura-router.onEngineEvent → CustomEvent (DOM P0 + load:*)
```

### Кто что emit'ит

```text
NavigationPulse (единая точка payload shape)
  navigation:start / finish / cancel / redirect / error
  navigation:prepare:*, load:*, commit:*, url-aligned, node:*

Coordinator.processResult
  → pulse.settle(TransactionResult)   // terminal bus events

Pipeline
  → pulse phase methods вокруг guards / loads / commit slice
```

### DOM bridge (aura-router)

| Bus | DOM | Статус |
|-----|-----|--------|
| `navigation:start` / url-aligned | `navigation-start` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `commit:end` | `navigation` (commit) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:finish` | `navigation-complete` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:cancel` | `navigation-cancel` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:redirect` | `navigation-redirect` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:error` | `navigation-error` (+ hook / not-found) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

**Supersede:** устаревший job → `navigation:cancel` (не `finish`); новый — свой `navigation:start`.

---

## Terminal apply <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

Единая точка **apply** (side effects) — функции в `navigation-outcome-handler.ts`, **не** class/deps-порт и **не** Pulse.  
Pulse = observe-only (`settle` = emit).

```text
NavigationCoordinator.processResult
  → pulse.settle                          ✓ observe
  → host.applyTerminalOutcome(result, tx) ✓ → applyNavigationOutcome

Pre-match
  → applyPreMatchFailure(...)             ✓
  → finalizeResolveTerminal → settle → apply ✓
```

Settle → apply на всех terminal paths — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>.

---

## Схема слоёв (deps + errors)

```text
AuraRouter
  └─ AuraRoutingEngine                                    ✓
       EventBus + NavigationPulse                         ✓
       applyNavigationOutcome / applyPreMatchFailure      ✓
       NavigationProvider                                 ✓
       NavigationCoordinator                              ✓
         followRedirectsWithGuardWalk                     ✓
         processResult → pulse.settle → applyTerminalOutcome ✓
         └─ NavigationTransaction                         ✓
              engine ref (by design)                      ✓
              run() → TransactionResult                   ✓
```

---

## Польза по этапам

| Этап | Польза | Статус |
|------|--------|--------|
| **1. Extract NavigationRun** | Один объект = job + tracker + rollback | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `NavigationTransaction` |
| **2. NavigationCoordinator** | Dedupe + supersede (+ resolve) в одном месте | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **2b. Terminal apply** | Одна точка side effects | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `applyNavigationOutcome` |
| **3. Redirect collapse** | Один intent → один full run на leaf | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **4. EventBus / NavigationPulse** | Observability runtime | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **4b. Run history (ring buffer)** | Devtools timeline | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> EB4 |

---

## Границы ответственности (целевые)

```text
AuraRoutingEngine     I/O: match, provider, prev, links, registry, OutcomeHandler, EventBus/Pulse
                      ✓ EventBus/Pulse · ~ без OutcomeHandler класса
NavigationCoordinator  active transaction, dedupe, supersede, redirect resolve
                      ✓
NavigationTransaction  intent lifecycle: full + rollback; `tx.engine` by design
                      ✓
Terminal apply        applyNavigationOutcome / applyPreMatchFailure
                      ✓ (bus в Pulse.settle)
Redirect resolve      followRedirectsWithGuardWalk
                      ✓
NavigationTransactionPipeline  порядок шагов; pulse phase emits
                      ✓
```

**Не делать:**

- FIFO stack/queue pending navigations (latest-wins).
- Два full run на одну sync redirect-цепочку — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> уже не делаем.
- God object run (matcher, prefetch, scroll внутри run).
- Async gap inside the **view commit slice** (`commitStagedView` → `commitNavigation`) — см. [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md) § Commit slice / F3 и `core/ARCHITECTURE.md` § Commit Vocabulary. (History URL пишется раньше, sync, отдельно от этого slice.)

---

## Маппинг as-is → to-be

| As-is (док) | To-be | Факт в коде | Статус |
|-------------|-------|-------------|--------|
| `NavigationCoordinator.plan` | (без rename) | `NavigationCoordinator.plan()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `NavigationCoordinator.run()` / `navigate()` | (без rename) | coordinator + `NavigationTransaction.run()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `withCancelledTransactionScope` | transaction rollback | `runWithStagedViewRollback()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `ViewCommitTracker` | поле run | `NavigationTransaction.viewCommitTracker` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `commitGate` callback | (без deps-порта) | `tx.engine.commitHistoryIfNeeded` + `commitNavigation` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> · <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> `commitSuccess` |
| `finalize*` | `OutcomeHandler.apply` | engine methods + `pulse.settle` | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |
| `telemetry: { emit }` | emit-port | `NavigationPulse` на engine | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Redirect resolve внутри run | resolve → full | resolve в `coordinator.navigate` до run | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `NavigationIntent` | `run.intent` | — | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> |

---

## Шаги внедрения (incremental)

### Фаза 1b — terminal apply <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

1. <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `applyNavigationOutcome` / `applyPreMatchFailure` (функции).
2. <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Coordinator: `pulse.settle` → `host.applyTerminalOutcome`.
3. <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> **Критерий:** coordinator / commit-history / event-bus / redirect-collapse tests.

| Файл | Изменение | Статус |
|------|-----------|--------|
| `core/navigation/navigation-outcome-handler.ts` | функции apply | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `core/history/history-policy.ts` | `applyTransactionHistory` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `core/aura-routing-engine.ts` | `applyTerminalOutcome` + `outcomeContext()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

### Фаза 1 — Extract `NavigationRun` <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>

| Файл | Статус |
|------|--------|
| `core/navigation/navigation-transaction.ts` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `core/navigation/navigation-coordinator.ts` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| processor `transaction-scope` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> заменён rollback в transaction |

### Фаза 2 — `NavigationCoordinator` <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

1. <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Dedupe + active transaction + supersede + redirect resolve — в `NavigationCoordinator`.
2. <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> Rename в `NavigationRunManager` / `navigation-run-manager.ts` — **не делаем**.
3. <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> **Критерий:** `navigation-coordinator.test.ts`, dedupe/supersede без регрессий.

### Фаза 3 — Redirect collapse <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

См. [../done/REDIRECT_CHAIN_COLLAPSE.md](../done/REDIRECT_CHAIN_COLLAPSE.md).  
`followRedirectsWithGuardWalk` · один `coordinator.run` на leaf · один history commit.  
Отдельный `runBlockingOnly` / класс `RedirectResolver` / `NavigationIntent` — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>.

### Фаза 4 — Observability <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

1. <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `EventBus` + `NavigationPulse` (EB0–EB3).
2. <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> AuraRouter DOM P0: start / commit / complete / cancel / redirect / errors.
3. <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> Ring buffer — EB4 / [CACHE_DEVTOOLS](./CACHE_DEVTOOLS.md), не блокер.
4. Подробности — [../done/EVENT_BUS.md](../done/EVENT_BUS.md).

---

## State machine run (reference)

```mermaid
stateDiagram-v2
  [*] --> pending: coordinator.navigate()
  pending --> resolved: pipeline OK + committed
  pending --> rejected: cancelled | error | superseded
  rejected --> [*]: rollback if !viewCommitted
  resolved --> [*]
```

Явного поля `status` на transaction — <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> (есть `TransactionResult` + abort + `pulse.settle`).

---

## Связанные документы

- [../done/REDIRECT_CHAIN_COLLAPSE.md](../done/REDIRECT_CHAIN_COLLAPSE.md) — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> collapse
- [../done/EVENT_BUS.md](../done/EVENT_BUS.md) — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> EventBus, `NavigationPulse`, DOM P0
- [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) — DOM public API (аудит может отставать от кода)
- [NAVIGATION_TRANSACTION_MODEL.md](../NAVIGATION_TRANSACTION_MODEL.md) — политика redirect / cancel
- [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md) — Navigation Job
- [PIPELINE_STEP_RUNNER.md](./PIPELINE_STEP_RUNNER.md) — thenable runner / fast path
- [ENGINE_CONSOLIDATION.md](./ENGINE_CONSOLIDATION.md) — roadmap модулей

---

## Итог

| Концепт | Статус |
|---------|--------|
| **NavigationTransaction** (бывш. Run) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| **NavigationCoordinator** (бывш. RunManager) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| **Redirect collapse** | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| **EventBus / NavigationPulse / DOM P0** | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| **Rename Run / RunManager** | <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> — остаётся Coordinator / Transaction |
| **Terminal apply (`applyNavigationOutcome`)** | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| **Узкие deps (`commitSuccess`)** | <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> — остаётся `tx.engine` |
| **Ring buffer прошлых run** | <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> (EB4) |
| **`NavigationIntent` / класс `RedirectResolver`** | <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> |

Cleanup observe/apply закрыт (шаги 1–5).

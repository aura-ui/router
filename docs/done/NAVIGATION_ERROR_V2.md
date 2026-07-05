# Navigation Error Handling v2

План рефакторинга обработки ошибок навигации: detection / recovery / reporting как отдельные слои.

**Статус:** ✅ **Реализовано** (Phase 1–5). Миграция завершена напрямую в runtime-модули — bridge-адаптеры из sketch не понадобились.

**Runtime-модули:**

| Слой | Путь |
|------|------|
| Detection | `aura-routing-engine/core/failure/`, `view-mount/view-commit-tracker.ts`, `lifecycle/execution/phase-step.ts` |
| Recovery | `aura-route/core/view/view-controller.ts`, `aura-route/core/view/payloads.ts`, `aura-router/core/aura-router-not-found-controller.ts` |
| Reporting | `aura-router/core/navigation-events.ts` (DOM), engine callbacks в `aura-router/core/aura-router.ts` |
| History | `aura-routing-engine/core/history/history-policy.ts`, `navigation/finalize.ts` |
| Pipeline | `aura-routing-engine/core/processor/processor-pipeline.ts` |

**Связанные файлы:**

| Файл | Назначение |
|------|------------|
| [navigation-error-v2.sketch.ts](./navigation-error-v2.sketch.ts) | Исторический TS-скетч (deprecated) |
| [../NAVIGATION_TRANSACTION_MODEL.md](../NAVIGATION_TRANSACTION_MODEL.md) | Модель transaction |
| [../MAIN_PIPELINE.md](../MAIN_PIPELINE.md) | Processor pipeline |
| `src/modules/aura-routing-engine/core/failure/README.md` | Контракт failure-слоя |
| `src/modules/aura-router/README.md` | DOM events (`code`, `navigation-hook-error`) |

---

## Мотивация

### Проблемы старой архитектуры (устранены)

| Проблема | Симптом | Решение |
|----------|---------|---------|
| Два recovery-пути | `resolveError()` в view + `failWithError()` в pipeline | View возвращает `{ status: 'error' }`, pipeline нормализует через `normalizeFailure()` |
| Хрупкий commit | `viewCommitted = (phase === 'render')` | `ViewCommitTracker` → `none` / `staged` / `committed` |
| Throw как control flow | try/catch на каждой фазе, разная политика для `left` / `after` | `PHASES` + `runPhaseStep()` с `onThrow: 'failure' \| 'log' \| 'propagate'` |
| 404 вне модели | отдельный bypass в engine без `TransactionResult` | `FailedNavigation.notFound()` + `finalizeNotFoundNavigation()` |
| Дублирование уведомлений | `onNavigationError` callback + `navigation-error` DOM event | Engine callback → `dispatchNavigationError()` (единственный путь в DOM) |
| Смешение семантик | cancel / redirect / error / abort — разные исходы, один механизм | `TransactionResult` + `FailedNavigation` + `resolveHistoryPolicy()` |

### Целевые свойства v2

- **DRY:** один `normalizeFailure`, один `runPhaseStep`, одна history-функция — ✅
- **Современные стандарты:** `Error.cause`, стабильные `code`, явный commit snapshot — ✅
- **Reporting:** прямой DOM dispatch без in-memory bus — ✅
- **Расширяемость recovery через plug-in `RecoveryStrategy[]`** — ❌ сознательно не делали (см. ниже)

---

## Архитектура: три слоя (как реализовано)

```
Detection              Recovery                    Reporting
─────────              ────────                    ─────────
FailedNavigation       resolveError() (view)       dispatchNavigationError()
ViewCommitTracker      AuraRouterNotFoundController → not-found
NavigationError        .recover() (404)            dispatchNavigationHookError()
normalizeFailure()                                 → navigation-hook-error
runPhaseStep()
resolveHistoryPolicy()
```

1. **Detection** — `NavigationError`, `FailedNavigation`, `ViewCommitTracker`
2. **Recovery** — inline: error template в view, fallback UI в not-found controller
3. **Reporting** — engine callbacks → DOM helpers в `navigation-events.ts`

---

## Модель данных (runtime)

Sketch описывал `NavigationOutcome` и `NavigationFailure`. В runtime используются эквиваленты:

| Sketch | Runtime |
|--------|---------|
| `NavigationOutcome` | `TransactionResult` |
| `NavigationFailure` | `FailedNavigation` |
| `CommitSnapshot` | `ViewCommitSnapshot` (`view-mount/view-commit-state.ts`) |
| `CommitTracker` | `ViewCommitTracker` (`view-mount/view-commit-tracker.ts`) |
| `PHASE_SPEC` | `PHASES` (`lifecycle/phase-registry.ts`) |
| `runPhase()` | `runPhaseStep()` (`lifecycle/execution/phase-step.ts`) |

### ViewCommitSnapshot

```ts
interface ViewCommitSnapshot {
  view: 'none' | 'staged' | 'committed';
  href: string;
}
```

| Момент pipeline | `commit.view` |
|-----------------|---------------|
| до render | `none` |
| после mount (staged) | `staged` |
| после `commitStagedView` | `committed` |
| render error + error UI | `committed` |

### FailedNavigation

Терминальный snapshot от pipeline или pre-match NOT_FOUND через engine finalization.

**Коды (`NavigationFailureCode`):** `failure/navigation-error.ts`

| Code | Когда |
|------|-------|
| `NOT_FOUND` | `matchPath` → null |
| `GUARD_THROW` | `onLeave` / `onEnter` / `onLoad` threw |
| `HOOK_THROW` | registered hook threw |
| `LOAD_FAILED` | load phase |
| `CONTENT_LOAD_FAILED` | ContentResolver / loader |
| `RENDER_FAILED` | route.render / view mount |
| `TRANSITION_FAILED` | transitionOut / transitionIn |
| `REENTER_FAILED` | reenter |
| `INTERNAL` | programmer bug |

### HistoryPolicy

```ts
type HistoryPolicy =
  | 'preserve'        // push/replace: URL не менять
  | 'commit-target'   // pushState/replaceState на target
  | 'rollback-source' // pop: replaceState на from.href
```

```ts
resolveHistoryPolicy(result, action, ctx) → HistoryPolicy
applyHistoryPolicy(policy, ctx, provider)
```

---

## Phase spec — единый source of truth

`PHASES` в `lifecycle/phase-registry.ts` заменяет `LIFECYCLE_STEPS` + `NAVIGATION_PHASES` + `failOnLifecycleError`.

| Phase | hookPolicy | onThrow (`errorPolicy`) |
|-------|------------|-------------------------|
| leave, enter, load | blocking | failure |
| reenter, transitionOut, transitionIn | postCommit | failure |
| left, after | postCommit | log |

Generic runner: `runPhaseStep()` в `lifecycle/execution/phase-step.ts`.

---

## Recovery (inline, не plug-in)

Sketch описывал `RecoveryStrategy[]`. В runtime recovery встроен:

| Сценарий | Реализация |
|----------|------------|
| `NOT_FOUND` | `AuraRouterNotFoundController.recover()` + `dispatchNotFound()` |
| `RENDER_FAILED`, `LOAD_FAILED`, … | `resolveError()` в `view-controller.ts` → `{ status: 'error' }` |

View layer **не rethrow'ит** — монтирует recovery UI и возвращает `{ status: 'error' }` в `runViewCommit()`.

---

## Reporting

Engine callbacks (`onNavigationError`, `onNavigationHookError`, `onNotFound`) → DOM dispatch в `aura-router/core/navigation-events.ts`:

```ts
dispatchNavigationError(router, failure)
dispatchNavigationHookError(router, detail)
dispatchNotFound(router, url, source)
```

- `AuraRouter.configure({ onNavigationError })` **удалён** — подписка только через `addEventListener('navigation-error', …)`
- Event `navigation-error` содержит поле `code` (стабильный код ошибки)

---

## Mapping: старое → новое

| Было | Стало |
|------|-------|
| `TransactionResult.status: 'error'` | `{ status: 'error', failure: FailedNavigation }` |
| `viewCommitted: boolean` | `failure.commit.view === 'committed'` / `viewCommitTracker.isViewCommitted()` |
| `notFoundHandler` bypass | `FailedNavigation.notFound()` + recovery controller |
| `failWithError()` | `normalizeFailure()` + `finalizeFailure()` |
| `resolveError()` + rethrow | inline recovery, `{ status: 'error' }` |
| `onNavigationError` + ручной dispatch | engine callback → `dispatchNavigationError()` |
| `finalizeNavigation` switch | `resolveHistoryPolicy` + `applyHistoryPolicy` |

Bridge-адаптеры `toLegacyTransactionResult` / `fromLegacyTransactionResult` из sketch **не внедрялись** — миграция прошла напрямую.

---

## Осознанное изменение поведения

**Staged view + ошибка transition:**

| | Было | v2 |
|---|------|-----|
| render OK, transitionOut fail | `viewCommitted: false`, URL не коммитится | `commit.view: 'staged'` → `history: preserve` |
| render fail + error UI | `viewCommitted: true`, URL коммитится | `commit.view: 'committed'` → `history: commit-target` |

Покрыто тестами: `test/history/history-policy.test.ts` (`error staged transition push`).

---

## План миграции

### Phase 1 — ViewCommitSnapshot + history ✅

- [x] `ViewCommitTracker` в pipeline context
- [x] Snapshot: `markViewStaged`, `markViewCommitted`, `markViewCommittedAfterErrorRecovery`
- [x] `viewCommitted` из `commit.view`, не из `failedAt === 'render'`
- [x] `resolveHistoryPolicy` + `applyHistoryPolicy` вынесены из finalize
- [x] Тесты: `test/view-mount/view-commit-tracker.test.ts`, `test/history/*`, `aura-router/test/navigation-events.test.ts`

**Код:** `view-mount/view-commit-tracker.ts`, `view-mount/view-commit-state.ts`, `history/history-policy.ts`

---

### Phase 2 — normalizeFailure + без rethrow из view ✅

- [x] Класс `NavigationError` с `Error.cause`
- [x] Content load бросает `NavigationError`
- [x] `RouteViewController`: recovery inline, `{ status: 'error' }`
- [x] Убран path: mount error UI → rethrow → `failWithError`
- [x] Единый `normalizeFailure(error, ctx)`

**Код:** `failure/navigation-error.ts`, `aura-route/core/view/view-controller.ts`, `aura-route/core/view/payloads.ts`, `view-mount/view-commit-render.ts`

---

### Phase 3 — runPhaseStep generic ✅

- [x] `PHASES` заменяет policy fields в lifecycle steps
- [x] `runPhaseStep()` вместо `runLifecycleStepForRoute` + `failOnLifecycleError`
- [x] `onThrow: 'failure' | 'log' | 'propagate'`
- [x] Post-commit `left`/`after`: `onThrow: 'log'`, без rethrow

**Код:** `lifecycle/phase-registry.ts`, `lifecycle/execution/phase-step.ts`, `lifecycle/execution/phase-executor.ts`

---

### Phase 4 — NOT_FOUND как failure ✅

- [x] `matchPath null` → `FailedNavigation.notFound()` + `finalizeNotFoundNavigation`
- [x] `dispatchNotFound` / `dispatchNavigationError` / `dispatchNavigationHookError`
- [x] `AuraRouterNotFoundController.recover()` для fallback UI
- [x] push/replace коммитит URL (`resolveHistoryPolicy` + `code: NOT_FOUND`)

**Код:** `failure/navigation-failure.ts`, `navigation/finalize.ts`, `lifecycle/orchestration/not-found-exit-cleanup.ts`, `aura-router/core/aura-router-not-found-controller.ts`

---

### Phase 5 — DOM events в AuraRouter ✅

- [x] `dispatchNavigationError` / `dispatchNavigationHookError` / `dispatchNotFound`
- [x] `AuraRouter.configure({ onNavigationError })` удалён
- [x] `code` в `navigation-error` event detail
- [x] `navigation-hook-error` event при падении error hooks
- [x] `reportHookError` в lifecycle pipeline

**Код:** `aura-router/core/navigation-events.ts`, `aura-router/core/aura-router.ts`

> **Упрощение:** вместо `NavigationReporter` bus используется прямой dispatch из engine callbacks.

---

## Что не делаем

- `NavigationOutcome` union — достаточно `TransactionResult` + `FailedNavigation`
- `RecoveryStrategy[]` plug-in bus — inline recovery проще и покрывает текущие кейсы
- Bridge-адаптеры `toLegacyTransactionResult` / `fromLegacyTransactionResult`
- RxJS / EventEmitter / in-memory `NavigationReporter` bus
- `Result<T,E>` класс с map/flatMap
- Смешивание prefetch errors с navigation — отдельный `PrefetchOutcome`
- Post-commit фазы с rethrow — только `bestEffort` + report

---

## Runtime flow

```
navigateTo
  → match (или FailedNavigation.notFound)
  → processor.run → TransactionResult
  → on failure: inline recovery (view / not-found controller)
  → engine callbacks → dispatch* (DOM)
  → applyHistoryPolicy
```

---

## Checklist готовности к merge

- [x] Тесты `fake-provider.test.ts`, `processor-pipeline.test.ts` и вся suite (451 тест) проходят
- [x] Матрица history policy: `test/history/history-policy.test.ts`
- [x] Failure layer: `test/failure/*`
- [x] Lifecycle phases: `test/lifecycle/phase-step.test.ts`, `phase-executor.test.ts`, `hook-policy-executor.test.ts`
- [x] View commit: `test/view-mount/view-commit-tracker.test.ts`, `view-mount-rollback.test.ts`
- [x] Документация `aura-router/README.md` (event `code`, hook-error)
- [x] Sketch-файл помечен deprecated (`docs/todo/navigation-error-v2.sketch.ts`)

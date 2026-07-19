# EventBus — внутренний поток событий navigation / load

> **Статус:** <span style="color: #bf8700; font-weight: bold;">~</span> частично · **фаза 7**  
> **Последнее обновление:** 2026-06-30  
> **Связанные документы:** [FUTURE_PROOF_ENGINE.md §5](../FUTURE_PROOF_ENGINE.md), [IMPLEMENTATION_STEPS.md §фаза 7](../IMPLEMENTATION_STEPS.md), [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) (DOM public API)

---

## TL;DR

| | Сейчас | Цель |
|---|--------|------|
| Успешная навигация | Только callback `onNavigationCommitted` | Полный поток `navigation:*` по lifecycle |
| Ошибки | `onNavigationError` + DOM `navigation-error` | То же + `navigation:error` / `load:error` в bus |
| Loads / activate | Только hooks, без observability | `load:start/end/error`, `node:activate/deactivate` |
| Prefetch | `PrefetchIntentBus` (отдельная ось) | Не смешивать с navigation bus |
| Public DOM | `not-found`, `navigation-error`, `navigation-hook-error` | DOM — см. [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) P0; bus — engine + devtools |

**Почему «~ частично»:** есть **точечные хуки на финале** (commit / error) и **DOM только для ошибок**, но нет **непрерывного event stream** по фазам pipeline — нельзя подписаться на «навигация началась», «loads идут», «commit начался» без погружения в processor.

---

## Зачем

- **Аналитика и performance** — timestamps по фазам (`prepare`, `commit`, `load`).
- **Визуализация engine** — state machine, devtools timeline.
- **UI-индикаторы** — global pending / per-route loading без custom hooks в каждом приложении.
- **Единый контракт** — один bus для coordinator, processor, DataGraph; DOM events — thin bridge поверх (опционально).

Hooks остаются для **логики приложения**; EventBus — для **наблюдателей снаружи** (shell, analytics, devtools). См. принципы в [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md).

---

## Что уже есть

| Механизм | Где | Покрытие |
|----------|-----|----------|
| `onNavigationCommitted` | `commitHistoryIfNeeded / commitNavigation` → engine config | Один раз после commit gate |
| `onNavigationError` | `failure/finalize-failure.ts` | Terminal failure |
| DOM `CustomEvent` | `aura-router/core/navigation-events.ts` | `not-found`, `navigation-error`, `navigation-hook-error` |
| `PrefetchIntentBus` | `prefetch/intent/bus.ts` | Только prefetch intent, не navigation lifecycle |

**Не покрыто:** `navigation:start`, prepare, commit start/end, finish, cancel, redirect, per-node activate/deactivate, per-load start/end/error. Fast path (`runFastPipeline`) — тоже без emit.

---

## Целевой контракт

### Класс EventBus

По образцу `PrefetchIntentBus`:

```ts
type EngineEvent =
  | { type: 'navigation:start'; id: number; from: MatchedRouteInfo | null; to: MatchedRouteInfo; action: HistoryAction }
  | { type: 'navigation:prepare:start'; id: number }
  | { type: 'navigation:prepare:end'; id: number }
  | { type: 'navigation:commit:start'; id: number }
  | { type: 'navigation:commit:end'; id: number }
  | { type: 'navigation:finish'; id: number }
  | { type: 'navigation:cancel'; id: number; reason?: string }
  | { type: 'navigation:redirect'; id: number; url: string; replace: boolean }
  | { type: 'navigation:error'; id: number; failure: FailedNavigation }
  | { type: 'node:activate'; id: number; nodeId: string; pattern: string }
  | { type: 'node:deactivate'; id: number; nodeId: string; pattern: string }
  | { type: 'load:start'; id: number; nodeId: string; pattern: string }
  | { type: 'load:end'; id: number; nodeId: string; pattern: string }
  | { type: 'load:error'; id: number; nodeId: string; pattern: string; error: unknown };

class EventBus {
  subscribe(listener: (event: EngineEvent) => void): () => void;
  emit(event: EngineEvent): void;
  destroy(): void;
}
```

`id` — **navigation job id** из `NavigationCoordinator` (тот же, что в `RouteLifecycleContext.jobId`).

### Размещение

- Экземпляр на **`AuraRoutingEngine`** (или передаётся в coordinator + processor через deps).
- Публичный API: `engine.events.subscribe(...)` → unsubscribe.
- Существующие callbacks **не ломать** — могут остаться thin-wrapper’ами поверх bus (или bus emit + callback параллельно на переходный период).

### Опционально: мост в DOM

Минимум для «полного EventBus» — **in-engine bus**. Проброс ключевых событий как `CustomEvent` на `<aura-router>` — отдельное решение; пересекается с P0 в [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) (`navigation-start`, `navigation-commit`, …).

---

## Точки emit в pipeline

| Событие | Где emit | Примечание |
|---------|----------|------------|
| `navigation:start` | `NavigationTransaction.run()` после `NavigationCoordinator.run() supersede` | Включая from/to/action |
| `navigation:prepare:start` | `NavigationTransactionPipeline.run()` — вход в guards | Или один блок guards+loads |
| `navigation:prepare:end` | После `runLoads`, до `runRenderWithTransition` | |
| `load:start` / `load:end` / `load:error` | `NavigationTransactionPipeline.runLoads()` / `DataGraph` | Per route/node на activate-ветке |
| `node:deactivate` | По `TransitionMap.exitRoutes` (до/во время left) | Порядок согласовать с lifecycle |
| `node:activate` | По `TransitionMap.enterRoutes` (enter phase) | |
| `navigation:commit:start` | `runAfterRender()` — перед `commitEnterViews` | |
| `navigation:commit:end` | `applyCommitGate()` — после history + prev | Сейчас здесь же `onNavigationCommitted` |
| `navigation:finish` | `NavigationCoordinator` после успешного finalize | Terminal success |
| `navigation:cancel` | `finalizeProcessorNavigation` — `status === 'cancelled'` | |
| `navigation:redirect` | `finalizeProcessorNavigation` — `status === 'redirect'` | |
| `navigation:error` | `finalizeFailure` | Дублирует смысл `onNavigationError` |

**Fast path:** те же emit’ы в `runFastPipeline()` где применимо (`start`, `commit:*`, `node:*`, `finish`), иначе подписчики не увидят Tier 0 навигации.

**Supersede / abort:** не emit’ить `finish` / `commit:end` для устаревшего `jobId`; при отмене — `navigation:cancel` или тихий drop (зафиксировать в контракте).

---

## Связь с DOM events (NAVIGATION_EVENTS)

| EngineEvent (bus) | DOM event (public) | Статус DOM |
|-------------------|-------------------|------------|
| `navigation:error` | `navigation-error` | ✓ |
| — | `navigation-hook-error` | ✓ (hook path) |
| — | `not-found` | ✓ one-off |
| `navigation:start` | `navigation-start` | ⬜ P0 |
| `navigation:commit:end` | `navigation-commit` | ⬜ P0 |
| `navigation:finish` | `navigation-complete` | ⬜ P0 |
| `navigation:cancel` | `navigation-cancel` | ⬜ P0 |
| `navigation:redirect` | `navigation-redirect` | ⬜ P0 |
| `load:*` | опционально на router | ⬜ P1 |

Рекомендация: **bus — source of truth**; DOM dispatch — один adapter в `aura-router.ts` для P0, без дублирования логики в coordinator.

---

## План внедрения

### EB0 — Контракт и spike

- [ ] Файл `core/events/event-bus.ts` + `core/events/types.ts` (`EngineEvent`).
- [ ] Unit-тесты: subscribe / unsubscribe / emit order / destroy.
- [ ] Решение: bus на engine vs injectable deps (processor, coordinator, DataGraph).

### EB1 — Processor + coordinator

- [ ] `navigation:start` в `NavigationTransaction.run()`.
- [ ] `navigation:prepare:*` в `NavigationTransactionPipeline`.
- [ ] `load:*` в `runLoads()` / DataGraph.
- [ ] `node:activate` / `node:deactivate` по `TransitionMap`.
- [ ] `navigation:commit:*` в `runAfterRender()` + `applyCommitGate()`.
- [ ] `navigation:finish` / `cancel` / `redirect` / `error` в coordinator + finalize.
- [ ] Параллельные emit в `runFastPipeline()`.

### EB2 — Public API + callbacks

- [ ] `AuraRoutingEngine.events.subscribe()` (или `onEvent`).
- [ ] Опционально: существующие `onNavigationCommitted` / `onNavigationError` вызывают те же payload, что bus (backward compat).
- [ ] Экспорт типов из пакета engine / router.

### EB3 — DOM bridge (с P0 NAVIGATION_EVENTS)

- [ ] Adapter: bus → `dispatchNavigationStart`, `dispatchNavigationCommit`, … в `navigation-events.ts`.
- [ ] Тесты integration: happy path, cancel, redirect, fast path.
- [ ] `aura-router/README.md` — раздел bus vs DOM.

### EB4 — Devtools (zero cost prod)

- [ ] Подписчик только в dev / opt-in module (см. [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md)).
- [ ] Timeline: job id, фазы, duration между start → commit → finish.
- [ ] Опционально: `navigation:view-transition:*` при VT wrapper — [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md) VT4.

---

## Критерии готовности

- [ ] Подписчик получает упорядоченный поток на full pipeline: `start` → `prepare:*` → `load:*` (если есть) → `commit:*` → `finish`.
- [ ] Fast path эмитит эквivalent subset (без лишних prepare/load, если не было фаз).
- [ ] Superseded job не получает `finish` после нового `navigation:start`.
- [ ] `PrefetchIntentBus` и navigation `EventBus` не объединены.
- [ ] Существующие callbacks и DOM error events работают без регрессий.

---

## Ссылки на код

| Файл | Роль |
|------|------|
| `src/modules/aura-routing-engine/core/navigation/navigation-coordinator.ts` | `NavigationCoordinator.run() supersede` → `navigation:start` |
| `src/modules/aura-routing-engine/core/navigation/navigation-transaction-pipeline.ts` | guards, loads, commit, after |
| `src/modules/aura-routing-engine/core/navigation/…/runFastPipeline` | Tier 0 — те же emit |
| `src/modules/aura-routing-engine/core/commitHistoryIfNeeded / commitNavigation` | `onNavigationCommitted` → `navigation:commit:end` |
| `src/modules/aura-routing-engine/core/navigation/coordinator.ts` | terminal outcomes |
| `src/modules/aura-routing-engine/core/navigation/finalize.ts` | cancel / redirect |
| `src/modules/aura-routing-engine/core/prefetch/intent/bus.ts` | образец API |
| `src/modules/aura-router/core/navigation-events.ts` | DOM bridge (errors + будущий P0) |

---

## Журнал

| Дата | Изменение |
|------|-----------|
| 2026-06-30 | Создан todo: as-is, целевой контракт, точки emit, план EB0–EB4, связь с NAVIGATION_EVENTS |

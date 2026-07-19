# EventBus — внутренний поток событий navigation / load

> **Статус:** <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> — callbacks + DOM errors ✓ · класс `EventBus` / lifecycle stream ✗  
> **Сверка с кодом:** 2026-07-19 · **фаза 7**  
> **Связанные документы:** [FUTURE_PROOF_ENGINE.md §5](../FUTURE_PROOF_ENGINE.md), [IMPLEMENTATION_STEPS.md §фаза 7](../IMPLEMENTATION_STEPS.md), [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) (DOM public API)

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | каркас / точечный hook есть, не полный stream |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> | сознательно не в scope / by design |

### Сводка прогресса

| # | Тема | Статус | Что дальше |
|---|------|--------|------------|
| — | Terminal callbacks (`onNavigationCommitted` / `onNavigationError`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | thin-wrapper поверх bus позже |
| — | DOM errors (`not-found`, `navigation-error`, `navigation-hook-error`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | см. [NAVIGATION_EVENTS](./NAVIGATION_EVENTS.md) |
| — | `PrefetchIntentBus` (отдельная ось) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> не смешивать с nav bus |
| **EB0** | Контракт `EventBus` + `EngineEvent` + unit-тесты | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | `core/events/` |
| **EB1** | Emit в processor / coordinator / fast path | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | `navigation:*`, `load:*`, `node:*` |
| **EB2** | Public API `engine.events.subscribe()` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | + compat callbacks |
| **EB3** | DOM bridge P0 (`navigation-start` …) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [NAVIGATION_EVENTS](./NAVIGATION_EVENTS.md) |
| **EB4** | Devtools timeline (dev / opt-in) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [CACHE_DEVTOOLS](./CACHE_DEVTOOLS.md) |

---

## TL;DR

| | Сейчас | Цель | Статус |
|---|--------|------|--------|
| Успешная навигация | Только callback `onNavigationCommitted` | Полный поток `navigation:*` по lifecycle | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> callback ✓ · stream ✗ |
| Ошибки | `onNavigationError` + DOM `navigation-error` | То же + `navigation:error` / `load:error` в bus | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> callbacks/DOM ✓ · bus ✗ |
| Loads / activate | Только hooks, без observability | `load:start/end/error`, `node:activate/deactivate` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Prefetch | `PrefetchIntentBus` (отдельная ось) | Не смешивать с navigation bus | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> by design |
| Public DOM (success path) | — | `navigation-start` / commit / complete / cancel / redirect | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |

**Почему «~ частично»:** есть **точечные хуки на финале** (commit / error) и **DOM только для ошибок**, но нет **класса EventBus** и **непрерывного event stream** по фазам pipeline — нельзя подписаться на «навигация началась», «loads идут», «commit начался» без погружения в processor.

---

## Зачем

- **Аналитика и performance** — timestamps по фазам (`prepare`, `commit`, `load`).
- **Визуализация engine** — state machine, devtools timeline.
- **UI-индикаторы** — global pending / per-route loading без custom hooks в каждом приложении.
- **Единый контракт** — один bus для coordinator, processor, DataGraph; DOM events — thin bridge поверх (опционально).

Hooks остаются для **логики приложения**; EventBus — для **наблюдателей снаружи** (shell, analytics, devtools). См. принципы в [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md).

---

## Что уже есть — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

| Механизм | Где | Покрытие | Статус |
|----------|-----|----------|--------|
| `onNavigationCommitted` | `commitHistoryIfNeeded / commitNavigation` → engine config | Один раз после commit gate | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `onNavigationError` | `failure/finalize-failure.ts` | Terminal failure | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| DOM `CustomEvent` | `aura-router/core/navigation-events.ts` | `not-found`, `navigation-error`, `navigation-hook-error` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `PrefetchIntentBus` | `prefetch/intent/bus.ts` | Только prefetch intent, не navigation lifecycle | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> ⊘ отдельно |

## Что осталось — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

| Событие / поверхность | Статус |
|----------------------|--------|
| Класс `EventBus` + типы `EngineEvent` (`core/events/`) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:start` / `prepare:*` / `commit:*` / `finish` / `cancel` / `redirect` / `error` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `node:activate` / `node:deactivate` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `load:start` / `load:end` / `load:error` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Emit в `runFastPipeline()` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `engine.events.subscribe(...)` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| DOM P0: `navigation-start`, `navigation-commit`, `navigation-complete`, `navigation-cancel`, `navigation-redirect` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Devtools timeline (dev / opt-in) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

---

## Целевой контракт — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

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

## Точки emit в pipeline — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ все emit ✗</span>

| Событие | Где emit | Примечание | Статус |
|---------|----------|------------|--------|
| `navigation:start` | `NavigationTransaction.run()` после `NavigationCoordinator.run() supersede` | Включая from/to/action | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:prepare:start` | `NavigationTransactionPipeline.run()` — вход в guards | Или один блок guards+loads | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:prepare:end` | После `runLoads`, до `runRenderWithTransition` | | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `load:start` / `load:end` / `load:error` | `NavigationTransactionPipeline.runLoads()` / `DataGraph` | Per route/node на activate-ветке | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `node:deactivate` | По `TransitionMap.exitRoutes` (до/во время left) | Порядок согласовать с lifecycle | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `node:activate` | По `TransitionMap.enterRoutes` (enter phase) | | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:commit:start` | `runAfterRender()` — перед `commitEnterViews` | | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:commit:end` | `applyCommitGate()` — после history + prev | Сейчас здесь же `onNavigationCommitted` ✓ | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> bus · <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> callback |
| `navigation:finish` | `NavigationCoordinator` после успешного finalize | Terminal success | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:cancel` | `finalizeProcessorNavigation` — `status === 'cancelled'` | | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:redirect` | `finalizeProcessorNavigation` — `status === 'redirect'` | | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `navigation:error` | `finalizeFailure` | Дублирует смысл `onNavigationError` ✓ | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> bus · <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> callback |

**Fast path:** те же emit’ы в `runFastPipeline()` где применимо (`start`, `commit:*`, `node:*`, `finish`) — <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>, иначе подписчики не увидят Tier 0 навигации.

**Supersede / abort:** не emit’ить `finish` / `commit:end` для устаревшего `jobId`; при отмене — `navigation:cancel` или тихий drop (зафиксировать в контракте) — <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>.

---

## Связь с DOM events (NAVIGATION_EVENTS)

| EngineEvent (bus) | DOM event (public) | Статус bus | Статус DOM |
|-------------------|-------------------|------------|------------|
| `navigation:error` | `navigation-error` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| — | `navigation-hook-error` | — | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (hook path) |
| — | `not-found` | — | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> one-off |
| `navigation:start` | `navigation-start` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `navigation:commit:end` | `navigation-commit` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `navigation:finish` | `navigation-complete` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `navigation:cancel` | `navigation-cancel` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `navigation:redirect` | `navigation-redirect` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `load:*` | опционально на router | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P1 |

Рекомендация: **bus — source of truth**; DOM dispatch — один adapter в `aura-router.ts` для P0, без дублирования логики в coordinator.

---

## План внедрения

### EB0 — Контракт и spike — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Файл `core/events/event-bus.ts` + `core/events/types.ts` (`EngineEvent`).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Unit-тесты: subscribe / unsubscribe / emit order / destroy.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Решение: bus на engine vs injectable deps (processor, coordinator, DataGraph).

### EB1 — Processor + coordinator — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `navigation:start` в `NavigationTransaction.run()`.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `navigation:prepare:*` в `NavigationTransactionPipeline`.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `load:*` в `runLoads()` / DataGraph.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `node:activate` / `node:deactivate` по `TransitionMap`.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `navigation:commit:*` в `runAfterRender()` + `applyCommitGate()`.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `navigation:finish` / `cancel` / `redirect` / `error` в coordinator + finalize.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Параллельные emit в `runFastPipeline()`.

### EB2 — Public API + callbacks — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `AuraRoutingEngine.events.subscribe()` (или `onEvent`).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Существующие `onNavigationCommitted` / `onNavigationError` работают (пока без bus).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Опционально: callbacks вызывают те же payload, что bus (backward compat overlay).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Экспорт типов из пакета engine / router.

### EB3 — DOM bridge (с P0 NAVIGATION_EVENTS) — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> DOM errors уже есть (`not-found`, `navigation-error`, `navigation-hook-error`).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Adapter: bus → `dispatchNavigationStart`, `dispatchNavigationCommit`, … в `navigation-events.ts`.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Тесты integration: happy path, cancel, redirect, fast path.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `aura-router/README.md` — раздел bus vs DOM.

### EB4 — Devtools (zero cost prod) — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Подписчик только в dev / opt-in module (см. [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md)).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Timeline: job id, фазы, duration между start → commit → finish.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Опционально: `navigation:view-transition:*` при VT wrapper — [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md) VT4.

---

## Критерии готовности — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ не закрыты</span>

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Подписчик получает упорядоченный поток на full pipeline: `start` → `prepare:*` → `load:*` (если есть) → `commit:*` → `finish`.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Fast path эмитит эквivalent subset (без лишних prepare/load, если не было фаз).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Superseded job не получает `finish` после нового `navigation:start`.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `PrefetchIntentBus` и navigation `EventBus` не объединены (nav bus ещё нет; prefetch bus отдельно).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Существующие callbacks и DOM error events работают без регрессий.

---

## Ссылки на код

| Файл | Роль | Статус |
|------|------|--------|
| `src/modules/aura-routing-engine/core/navigation/navigation-coordinator.ts` | `NavigationCoordinator.run() supersede` → `navigation:start` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> emit |
| `src/modules/aura-routing-engine/core/navigation/navigation-transaction-pipeline.ts` | guards, loads, commit, after | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> emit |
| `src/modules/aura-routing-engine/core/navigation/…/runFastPipeline` | Tier 0 — те же emit | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> emit |
| `src/modules/aura-routing-engine/core/commitHistoryIfNeeded / commitNavigation` | `onNavigationCommitted` → `navigation:commit:end` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> callback · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> bus |
| `src/modules/aura-routing-engine/core/navigation/coordinator.ts` | terminal outcomes | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> emit |
| `src/modules/aura-routing-engine/core/navigation/finalize.ts` | cancel / redirect | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> emit |
| `src/modules/aura-routing-engine/core/prefetch/intent/bus.ts` | образец API | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `src/modules/aura-router/core/navigation-events.ts` | DOM bridge (errors + будущий P0) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> errors · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |

---

## Журнал

| Дата | Изменение |
|------|-----------|
| 2026-06-30 | Создан todo: as-is, целевой контракт, точки emit, план EB0–EB4, связь с NAVIGATION_EVENTS |
| 2026-07-19 | Сверка с кодом: яркие бейджи ✓/~✗; сводка прогресса; отмечено готовое (callbacks/DOM errors/PrefetchIntentBus) vs осталось (EB0–EB4 целиком) |

# EventBus — внутренний поток событий navigation / load

> **Статус:** <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> — EB0–EB2 ✓ · EB1 lifecycle stream ✓ · DOM P0 half (EB3) · EB4 ✗  
> **Сверка с кодом:** 2026-07-19 · **фаза 7** (EB1 processor + coordinator)  
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
| — | Terminal error callback (`onNavigationError`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | thin-wrapper поверх bus позже |
| — | DOM errors (`not-found`, `navigation-error`, `navigation-hook-error`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | см. [NAVIGATION_EVENTS](./NAVIGATION_EVENTS.md) |
| — | `PrefetchIntentBus` (отдельная ось) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> не смешивать с nav bus |
| **EB0** | Контракт `EventBus` + `EngineEvent` + unit-тесты | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | `core/events/` · типы расширяются по мере emit |
| **EB1** | Emit в processor / coordinator / fast path | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | full + update + fast · terminal в `processResult` / `finalizeResolveTerminal` |
| **EB2** | Public API `engine.events.subscribe()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | + `router.events` · exports из пакета · error callback ещё отдельно |
| **EB3** | DOM bridge P0 | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | ✓ `navigation-start` + `navigation` · ✗ complete / cancel / redirect |
| **EB4** | Devtools timeline (dev / opt-in) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [CACHE_DEVTOOLS](./CACHE_DEVTOOLS.md) |

---

## TL;DR

| | Сейчас | Цель | Статус |
|---|--------|------|--------|
| Успешная навигация | Bus: `start` → … → `finish` · DOM: `navigation-start` → `navigation` | Полный поток + DOM complete | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> bus ✓ · DOM complete ✗ |
| Ошибки | Bus `navigation:error` / `load:error` + callback + DOM | Thin-wrapper: callback поверх bus | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> bus+callback ✓ · overlay ✗ |
| Loads / activate | `load:*`, `node:activate/deactivate` на bus | То же (+ опц. DOM P1) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> bus |
| Prefetch | `PrefetchIntentBus` (отдельная ось) | Не смешивать с navigation bus | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> by design |
| Public DOM (success path) | `navigation-start`, `navigation` (commit) | + complete / cancel / redirect | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> P0 half |

**Почему «~ частично»:** **EB1 закрыт** — in-engine stream полный (`start` → `prepare:*` / `load:*` / `node:*` → `url-aligned` → `commit:*` → `finish` / `cancel` / `redirect` / `error`). Осталось **EB3** (DOM complete/cancel/redirect) и **EB4** (devtools). Callback `onNavigationCommitted` удалён; `onNavigationError` пока параллельно с bus.

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
| Класс `EventBus` + типы | `core/events/event-bus.ts`, `types.ts`, `index.ts` | subscribe / emit / destroy | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Unit-тесты bus | `test/events/event-bus.test.ts` | order, unsubscribe, destroy | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Bus на engine | `AuraRoutingEngine.events` · `destroy()` чистит listeners | Production | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Public API | `engine.events.subscribe()` · `AuraRouter.events` · export из `core.ts` | | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Emit lifecycle stream (EB1) | transaction / pipeline / coordinator | `start`…`finish` / `cancel` / `redirect` / `error` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Emit `navigation:url-aligned` | `notifyUrlAligned` ← pipeline `commitHistory()` | После history write / pop / system | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Emit `navigation:commit:end` + `node:activate` | `commitNavigation` | View promoted + `prev` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| DOM `navigation-start` | `aura-router.onEngineEvent` ← `url-aligned` | Active links + CustomEvent | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| DOM `navigation` (commit) | `onEngineEvent` ← `commit:end` | Scroll / not-found catch-all / CustomEvent | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `onNavigationError` | `failure/finalize-failure.ts` | Terminal failure (callback || bus) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| DOM error CustomEvents | `aura-router/core/navigation-events.ts` | `not-found`, `navigation-error`, `navigation-hook-error` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `PrefetchIntentBus` | `prefetch/intent/bus.ts` | Только prefetch intent | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> ⊘ отдельно |
| Тесты | `event-bus*.test.ts`, `commit-history.test.ts` | bus + pipeline + terminal | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

## Что осталось — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

| Событие / поверхность | Статус |
|----------------------|--------|
| In-engine lifecycle stream (EB0–EB2) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| DOM P0: `navigation-complete` / `navigation-cancel` / `navigation-redirect` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> EB3 |
| `onNavigationError` thin-wrapper поверх bus | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> (сейчас параллельно) |
| Devtools timeline (dev / opt-in) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> EB4 |

---

## Целевой контракт — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ bus ✓</span> · DOM <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span>

### Класс EventBus — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

По образцу `PrefetchIntentBus` — реализовано:

```ts
class EventBus {
  subscribe(listener: (event: EngineEvent) => void): () => void;
  emit(event: EngineEvent): void;
  destroy(): void;
}
```

### EngineEvent (as-is в коде) — все варианты эмитятся

```ts
type EngineEvent =
  | { type: 'navigation:start'; id; from; to; action }
  | { type: 'navigation:url-aligned'; id; from; to; action; hash; source: 'write' | 'browser' }
  | { type: 'navigation:prepare:start' | 'navigation:prepare:end'; id }
  | { type: 'navigation:commit:start'; id }
  | { type: 'navigation:commit:end'; id; from; to; action; hash }
  | { type: 'navigation:finish'; id }
  | { type: 'navigation:cancel'; id; reason? }
  | { type: 'navigation:redirect'; id; url; replace }
  | { type: 'navigation:error'; id; failure: FailedNavigation }
  | { type: 'node:activate' | 'node:deactivate'; id; nodeId; pattern }  // nodeId === pattern
  | { type: 'load:start' | 'load:end'; id; nodeId; pattern }
  | { type: 'load:error'; id; nodeId; pattern; error: unknown };
```

`id` — **navigation job / transaction id** (`transactionId`).

### Размещение — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

- Экземпляр на **`AuraRoutingEngine`** (`readonly events = new EventBus()`).
- Публичный API: `engine.events.subscribe(...)` → unsubscribe; зеркало `AuraRouter.events`.
- `onNavigationCommitted` **убран** — chrome идёт через bus. `onNavigationError` пока callback параллельно (не thin-wrapper поверх bus).

### Опционально: мост в DOM — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

In-engine bus + adapter в `aura-router.ts` (`onEngineEvent`):

| Bus | DOM | Статус |
|-----|-----|--------|
| `navigation:url-aligned` | `navigation-start` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:commit:end` | `navigation` (не `navigation-commit`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:finish` / cancel / redirect | `navigation-complete` / cancel / redirect | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

---

## Точки emit в pipeline — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

| Событие | Где emit | Примечание | Статус |
|---------|----------|------------|--------|
| `navigation:start` | `NavigationTransaction.run()` | + `node:deactivate` по `exitRoutes` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:url-aligned` | `commitHistory()` → `notifyUrlAligned` | После write / для pop+system без write | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:prepare:start` / `end` | шаги в `runSequentially` (full / update) | `end` только если prepare дошёл до конца; fast path без prepare | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `load:start` / `load:end` / `load:error` | `runLoads()` | Per enter route; error только при `status === 'error'` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `node:deactivate` | При `navigation:start` | `exitRoutes` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `node:activate` | `commitNavigation()` | `enterRoutes`; `nodeId === pattern` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:commit:start` | `runAfterRender()` / `runUpdate()` | Перед sync commit slice | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:commit:end` | `commitNavigation()` | View promoted + `prev` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:finish` | `processResult` | Terminal success | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:cancel` | `processResult` / `finalizeResolveTerminal` | В т.ч. supersede → cancelled | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:redirect` | то же | | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:error` | то же + callback `onNavigationError` | Bus и callback параллельно | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

**Fast path:** `start` → (deactivate) → `url-aligned` → `commit:start` → `commit:end` → (activate) → `finish` — без prepare/load.

**Supersede / abort:** устаревший job получает `navigation:cancel` (не `finish`); новый — свой `navigation:start`.

**Redirect-walk probe (`id: 0`):** `runRedirectCollapse` / `finalizeResolveTerminal` **не** пишут в bus (нет `run()` → нет `start`). Callbacks / history policy остаются.

---

## Связь с DOM events (NAVIGATION_EVENTS)

| EngineEvent (bus) | DOM event (public) | Статус bus | Статус DOM |
|-------------------|-------------------|------------|------------|
| `navigation:error` | `navigation-error` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (через callback) |
| — | `navigation-hook-error` | — | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (hook path) |
| — | `not-found` | — | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> one-off |
| `navigation:url-aligned` | `navigation-start` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:commit:end` | `navigation` (= commit; не имя `navigation-commit`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `navigation:finish` | `navigation-complete` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `navigation:cancel` | `navigation-cancel` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `navigation:redirect` | `navigation-redirect` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P0 |
| `load:*` | опционально на router | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> P1 |

Рекомендация: **bus — source of truth**; DOM dispatch — один adapter в `aura-router.ts` (уже так для start/commit). Errors пока через callback — перевести на bus emit + тот же adapter.

---

## План внедрения

### EB0 — Контракт и spike — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Файл `core/events/event-bus.ts` + `core/events/types.ts` (`EngineEvent`).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Unit-тесты: subscribe / unsubscribe / emit order / destroy.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Решение: bus на engine (`AuraRoutingEngine.events`); pipeline зовёт `notifyUrlAligned` / `commitNavigation`.

### EB1 — Processor + coordinator — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `navigation:start` + `node:deactivate` в `NavigationTransaction.run()` (рядом с `url-aligned`, не вместо).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `navigation:url-aligned` в `commitHistory()` / `notifyUrlAligned`.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `navigation:prepare:*` как шаги в `runSequentially` (full + update; fast path пропускает).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `load:*` в `runLoads()` (per enter route; `load:error` при `status === 'error'`).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `node:activate` в `commitNavigation()`; `node:deactivate` при start (`nodeId === pattern`).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `navigation:commit:start` в `runAfterRender()` / `runUpdate()`.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `navigation:commit:end` в `commitNavigation()`.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `finish` / `cancel` / `redirect` / `error` — `emitNavigationTerminal` в coordinator + `finalizeResolveTerminal`.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Fast path: `url-aligned` + `commit:*` (без prepare/load).

### EB2 — Public API + callbacks — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (error overlay ✗)

- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `AuraRoutingEngine.events.subscribe()` (+ `AuraRouter.events`).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Commit chrome через bus (callback `onNavigationCommitted` удалён).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `onNavigationError` → emit `navigation:error` + thin-wrapper (backward compat).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Экспорт типов из пакета engine (`EventBus`, `EngineEvent`, …).

### EB3 — DOM bridge (с P0 NAVIGATION_EVENTS) — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> DOM errors уже есть (`not-found`, `navigation-error`, `navigation-hook-error`).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Adapter: bus → `dispatchNavigationStart` / `dispatchNavigationCommitted` в `onEngineEvent`.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Adapter для complete / cancel / redirect.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Тесты integration: happy path, cancel, redirect, fast path (DOM + bus order).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `aura-router/README.md` — раздел bus vs DOM.

### EB4 — Devtools (zero cost prod) — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Подписчик только в dev / opt-in module (см. [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md)).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Timeline: job id, фазы, duration между start → commit → finish.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Опционально: `navigation:view-transition:*` при VT wrapper — [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md) VT4.

---

## Критерии готовности — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ bus ✓ · DOM/devtools ✗</span>

- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Подписчик получает упорядоченный поток на full pipeline: `start` → `prepare:*` → `load:*` → `commit:*` → `finish`.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Happy-path pulse: `url-aligned` → `commit:end` (full + fast + update).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Fast path: subset без prepare/load + terminal `finish` / `cancel`.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Superseded job получает `cancel`, не `finish` (новый — свой `start`).
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `PrefetchIntentBus` и navigation `EventBus` не объединены.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Существующие error callbacks и DOM error events работают без регрессий.
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> DOM success: `navigation-start` + `navigation` через bus adapter.
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> DOM P0: complete / cancel / redirect (EB3).
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Devtools timeline (EB4).

---

## Ссылки на код

| Файл | Роль | Статус |
|------|------|--------|
| `src/modules/aura-routing-engine/core/navigation/navigation-pulse.ts` | **единственное место payload emit** (`NavigationPulse`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `src/modules/aura-routing-engine/core/events/*` | `EventBus` + `EngineEvent` (транспорт + типы) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `src/modules/aura-routing-engine/core/aura-routing-engine.ts` | `events` + `pulse` · side-effects commit/history | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| pipeline / transaction / coordinator | тонкие вызовы `pulse.*` (без object literals) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `src/modules/aura-routing-engine/test/events/event-bus-pipeline.test.ts` | EB1 coverage | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `src/modules/aura-routing-engine/core/prefetch/intent/bus.ts` | образец API | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `src/modules/aura-router/core/aura-router.ts` | `onEngineEvent` adapter | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> start+commit |
| `src/modules/aura-router/core/navigation-events.ts` | DOM bridge | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> errors+start+`navigation` · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> complete/cancel/redirect |

---

## Журнал

| Дата | Изменение |
|------|-----------|
| 2026-06-30 | Создан todo: as-is, целевой контракт, точки emit, план EB0–EB4, связь с NAVIGATION_EVENTS |
| 2026-07-19 | Сверка с кодом: яркие бейджи ✓/~✗; сводка прогресса; отмечено готовое (callbacks/DOM errors/PrefetchIntentBus) vs осталось (EB0–EB4 целиком) |
| 2026-07-19 | Повторная сверка: EB0 ✓ · EB2 ✓ · pulse + DOM start/`navigation` ✓ · EB1/EB3 ~ · EB4 ✗ |
| 2026-07-19 | EB1: `start` / `prepare:*` / `load:*` / `node:*` / `commit:start` / terminal; тесты `event-bus-pipeline.test.ts`; осталось EB3/EB4 |
| 2026-07-19 | Рефактор: все emit payload в `NavigationPulse`; pipeline/coordinator — только `pulse.*` |
| 2026-07-19 | `NavigationPulse` перенесён в `core/navigation/` (`events/` = bus + types) |

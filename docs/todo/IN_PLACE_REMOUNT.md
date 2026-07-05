# TODO: In-place param remount

> **Статус:** core закрыт — replace + `preserve.view` round-trip, pipeline order, exit cache key  
> **Цель:** зафиксировать суть проблемы и что ещё можно упростить без ViewSession / split фаз  
> **См. также:** [REPLACE_SUPERSEDE_ROLLBACK.md](./REPLACE_SUPERSEDE_ROLLBACK.md), [CONTENT_CACHE.md](./CONTENT_CACHE.md), [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md)

**Последняя сверка с кодом:** 2026-07-06 — `param-change-remount.integration.test.ts` round-trip pass; pipeline order — `navigation-transaction-pipeline.test.ts`.

---

## Суть проблемы

**In-place remount** — навигация `/users/1` → `/users/2` на **том же** `<aura-route>` (тот же route record), когда меняются params и **viewKey** (`view="user-{{id}}.html"`), но ветка дерева не меняется.

Plan строит synthetic exit + enter на одном leaf. Для engine это обычный переход: `exitRoutes: [fromLeaf]`, `enterRoutes: [toLeaf]` — **один и тот же DOM-элемент и один `RouteViewController`**.

Отсюда три связанных конфликта:

### 1. Один controller на «exit» и «enter»

Стандартный post-render pipeline (старый pipeline A):

```text
render enter → commitStaged → onUnmount exit
```

К моменту `onUnmount` controller уже смонтировал **новый** view (enter).  
Обычный `unmountOnLeave` не различает «кто уходит»:

- при `strategy === 'stage'` вызывает `cancelStagedIncoming` → **убивает incoming (новый) view**;
- при `replace` сносит `activeHandle` → тоже **новый** view.

**Симптом:** после param-change remount экран пустой или снова старый контент.

**Решение:** teardown **только outgoing** (`stageOutgoingHandle`) через `unmountParamChangeOutgoing`, не трогая active/staged enter.

### 2. Порядок unmount vs commit

При staged remount в outlet одновременно:

- `activeHandle` — старый view (exit);
- staged incoming — новый view (enter).

`commitStagedView` промотирует staged → active. Если `onUnmount` идёт **после** commit, outgoing handle уже потерян или перепутан с active.

**Нужно:** unmount outgoing **до** `commitStagedView`.

**Сейчас в коде:** `NavigationTransactionPipeline.runAfterRender` — **unmount → commitStaged → commitNavigation → ready** (глобально для всех success-навигаций).

### 3. ViewCache key: exit vs enter

После render enter `lastCacheKey` на controller указывает на **новый** pathname (`/users/2`).  
Outgoing DOM нужно положить в cache под **exit** key (`/users/1`).

**Сейчас в коде:** `AuraRoute.onUnmount(ctx)` передаёт `cacheKey(ctx.to, route.path)` в `RouteViewController.onUnmount({ cacheKey })`. Exit slice берётся из lifecycle context на unmount phase (`exitRoutes` → `ctx.to`).

---

## Диаграмма конфликта

```text
                    ┌─────────────────────────────────┐
                    │  один <aura-route> / controller │
                    └─────────────────────────────────┘
                                    │
         exit (/users/1)            │            enter (/users/2)
              │                     │                     │
              ▼                     ▼                     ▼
     plan.exitRoutes[0]     render(to)           plan.enterRoutes[0]
              │              stage/replace                  │
              │         active + outgoing                   │
              └──────── onUnmount(exit) ──► кого снимать? ──┘
                         ▲
                         └── обычный leave сносит не того
```

---

## Реализовано

| Механизм | Роль | Где |
|----------|------|-----|
| `TransitionMap.paramChangeRemount` | plan сигналит synthetic remount на том же record | `transition-plan.ts` |
| Staged mount при remount | `preserve.view` или transition → два DOM без мерцания | `render-pass.ts` |
| `unmountParamChangeOutgoing` | outlet снимает только `stageOutgoingHandle` | `outlet.ts` |
| `isViewAlreadyInOutlet` bypass | при remount не skip render из‑за живого mount | `view-controller.ts` |
| `paramChangeRemount` в render options | pipeline → `runViewCommit` → controller | `navigation-transaction-pipeline.ts` |
| unmount hooks на exitRoutes | `PHASES.unmount.targetRoutes = 'exitRoutes'` | `phase-registry.ts` |
| **Pipeline order** | `unmount → commitStaged → commitNavigation → ready` | `runAfterRender()` |
| **Exit ViewCache key** | `cacheKey(ctx.to, path)` → `onUnmount({ cacheKey })` | `aura-route.ts`, `view-controller.ts` |
| **`onUnmount(ctx)`** | exit key из lifecycle context, не `lastCacheKey` | `aura-route.ts` |

Content cache (`DataCache`) не затронут — loader cache живёт отдельно от DOM ViewCache.

**Тесты:** `param-change-remount.integration.test.ts`, `navigation-transaction-pipeline.test.ts` (`runAfterRender`, full pipeline), `view-controller.test.ts`, `param-change-lifecycle.test.ts`.

---

## Осталось (не блокер core)

| Задача | Статус | Комментарий |
|--------|--------|-------------|
| UPDATE (same viewKey) E2E | <span style="color:#ffb000;font-weight:bold">[~]</span> | lifecycle + `runUpdate` tests есть; E2E с реальным view нет |
| Transition in-place | <span style="color:#ff4444;font-weight:bold">[ ]</span> | stage + crossfade без double-teardown — тестов нет |
| User-facing docs `preserve.view` | <span style="color:#ff4444;font-weight:bold">[ ]</span> | loader cache + optional DOM keep-alive |
| Упростить `paramChangeRemount` в render options | optional | pipeline уже знает режим; flag на controller можно убрать позже |
| Отдельная фаза `remount` / `onRemount` | optional | вместо overload unmount для публичных hooks |
| ViewSession keyed by viewKey | отвергнуто | слишком много кода для текущего scope |

---

## Что ещё можно упростить (не блокер)

| Сейчас | Возможное упрощение |
|--------|---------------------|
| `paramChangeRemount` в render options | pipeline сам знает режим; controller только stage/replace policy |
| `lastCacheKey` fallback на controller | только fallback; primary key — `cacheKey` из ctx |
| overload `onUnmount` для remount | отдельная фаза `remount` + `onRemount` (если нужны публичные hooks) |
| ViewSession keyed by viewKey | отвергнуто — слишком много кода для текущего scope |

---

## Два cache — оба остаются

| Cache | Где | Когда invalidation / stash |
|-------|-----|----------------------------|
| **Content** | `DataCache` / loader | prefetch + render; **не** onUnmount |
| **DOM** | `RouteViewCache` | detach outgoing при leave / remount; key = pathname (+ query) |

In-place remount **не блокирует** content cache. DOM cache требует **outgoing detach**, не save-before-render на replace.

---

## Критерии готовности

- <span style="color:#39ff14;font-weight:bold">[x]</span> `/users/1` → `/users/2` (per-id viewKey): новый view на экране после navigation
- <span style="color:#39ff14;font-weight:bold">[x]</span> `preserve.view` + in-place: outgoing DOM в ViewCache под exit pathname — integration round-trip pass
- <span style="color:#39ff14;font-weight:bold">[x]</span> unmount hooks на exitRoutes отрабатывают (`unmount="…"`)
- <span style="color:#39ff14;font-weight:bold">[x]</span> unmount outgoing **до** commitStaged — глобальный порядок в `runAfterRender`
- <span style="color:#39ff14;font-weight:bold">[x]</span> exit stash key из lifecycle context (`ctx.to`), не `lastCacheKey` enter
- <span style="color:#ffb000;font-weight:bold">[~]</span> UPDATE (same viewKey): без render, patch path не сломан — lifecycle tests; E2E нет
- <span style="color:#ff4444;font-weight:bold">[ ]</span> Transition in-place: stage + crossfade без double-teardown
- <span style="color:#ff4444;font-weight:bold">[ ]</span> Документировать `preserve.view` = loader cache + optional DOM keep-alive в user-facing docs

---

## Одной фразой

**In-place remount на одном route record требует outgoing-only teardown, unmount до commit и exit ViewCache key из unmount context. Core закрыт: `unmountParamChangeOutgoing`, global pipeline order, `cacheKey(ctx.to)`. Осталось: transition in-place, user docs, UPDATE E2E.**

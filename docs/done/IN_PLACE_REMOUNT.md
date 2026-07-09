# In-place param remount

> **Статус:** реализовано полностью  
> **Цель:** зафиксировать суть проблемы и принятые решения (reference)  
> **См. также:** [REPLACE_SUPERSEDE_ROLLBACK.md](./REPLACE_SUPERSEDE_ROLLBACK.md), [CONTENT_CACHE.md](./CONTENT_CACHE.md), [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md), [../PRESERVE.md](../PRESERVE.md)

**Последняя сверка с кодом:** 2026-07-08 — `param-change-remount.integration.test.ts`, `param-change-transition.integration.test.ts`, `param-change-update.integration.test.ts`; pipeline order — `navigation-transaction-pipeline-after-render.test.ts`.

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

**Решение:** teardown **только outgoing** (`stageOutgoingHandle`) через `unmountParamChangeOutgoing`, не трогая active/staged enter. Оркестрация — `ViewTeardownPipeline.onUnmount()`.

### 2. Порядок unmount vs commit

При staged remount в outlet одновременно:

- `activeHandle` — старый view (exit);
- staged incoming — новый view (enter).

`commitStagedView` промотирует staged → active. Если `onUnmount` идёт **после** commit, outgoing handle уже потерян или перепутан с active.

**Нужно:** unmount outgoing **до** `commitStagedView`.

**Сейчас в коде:** `NavigationTransactionPipeline.runAfterRender` — **unmount → commitStaged → commitNavigation → ready** (глобально для всех success-навигаций).

### 3. RouteDomCache key: exit vs enter

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
| `resolveParamChangeMode` | auto: same `viewKey` → UPDATE, diff → navigate/remount | `transition-plan.ts` |
| Staged mount при remount | `cache.dom` или transition → два DOM без мерцания | `view-controller.ts` (`beginPass` → `useStagedMount`) |
| `unmountParamChangeOutgoing` | outlet снимает только `stageOutgoingHandle` | `outlet-adapter.ts` |
| `ViewTeardownPipeline` | post-render teardown: unmount / commitStaged / revert | `view-teardown-pipeline.ts` |
| `trySkipAlreadyMounted` bypass | при remount не skip render из‑за живого mount | `view-render-pipeline-phase.ts` |
| `paramChangeRemount` в render options | pipeline → `runViewCommit` → controller | `navigation-transaction-pipeline.ts` |
| unmount hooks на exitRoutes | `PHASES.unmount.targetRoutes = 'exitRoutes'` | `phase-registry.ts` |
| **Pipeline order** | `unmount → commitStaged → commitNavigation → ready` | `runAfterRender()` |
| **Exit domCacheKey** | `domCacheKey(ctx.to, path)` → `onUnmount({ domCacheKey })` | `aura-route.ts`, `view-teardown-pipeline.ts` |
| Fast-path / branch-atomic block | remount всегда full pipeline | `can-use-fast-path.ts`, `branch-resolver.ts` |

Content cache (`DataCache`) не затронут — loader cache живёт отдельно от RouteDomCache.

**Тесты:**

| Область | Файл |
|---------|------|
| Remount + cache round-trip | `param-change-remount.integration.test.ts` |
| Transition in-place (parallel / out-in / in-out) | `param-change-transition.integration.test.ts` |
| UPDATE same viewKey, real DOM | `param-change-update.integration.test.ts` |
| Pipeline order after render | `navigation-transaction-pipeline-after-render.test.ts` |
| Pipeline + transition order (mock) | `navigation-transaction-pipeline.test.ts` |
| Controller / outlet primitives | `view-controller.test.ts`, `outlet-adapter.test.ts`, `view-teardown-pipeline.test.ts` |
| Plan + nested LCA | `transition-plan.test.ts`, `param-change-lifecycle.test.ts` |

**User-facing docs:** [PRESERVE.md](../PRESERVE.md) — `cache.dom`, UPDATE vs FULL, param remount teardown.

> **Teardown hooks:** param remount использует **фазу `unmount`** на `exitRoutes` + флаг `paramChangeRemount` на controller. Отдельная lifecycle-фаза `remount` / атрибут `remount="…"` **не планируется** — overload `unmount` остаётся финальной моделью.

---

## Отвергнуто / вне scope

| Идея | Решение |
|------|---------|
| Отдельная фаза `remount` / `onRemount` | не будет; `unmount` + `paramChangeRemount` достаточно |
| ViewSession keyed by viewKey | слишком много кода для текущего scope |

Мелкий refactor (не блокер in-place remount): убрать дублирование `paramChangeRemount` в render options — pipeline уже знает режим.

> **Docs drift:** [PRESERVE.md](../PRESERVE.md) ещё упоминает фазу `remount` — при правке docs сверить с этим документом.

---

## Два cache — оба остаются

| Cache | Где | Когда invalidation / stash |
|-------|-----|----------------------------|
| **Content** | `DataCache` / loader | prefetch + render; **не** onUnmount |
| **DOM** | `RouteDomCache` | detach outgoing при leave / remount; key = pathname (+ query) |

In-place remount **не блокирует** content cache. DOM cache требует **outgoing detach**, не save-before-render на replace.

---

## Критерии готовности

- <span style="color:#39ff14;font-weight:bold">[x]</span> `/users/1` → `/users/2` (per-id viewKey): новый view на экране после navigation
- <span style="color:#39ff14;font-weight:bold">[x]</span> `cache.dom` + in-place: outgoing DOM в RouteDomCache под exit pathname — integration round-trip pass
- <span style="color:#39ff14;font-weight:bold">[x]</span> unmount hooks на exitRoutes отрабатывают (`unmount="…"`)
- <span style="color:#39ff14;font-weight:bold">[x]</span> unmount outgoing **до** commitStaged — глобальный порядок в `runAfterRender`
- <span style="color:#39ff14;font-weight:bold">[x]</span> exit stash key из lifecycle context (`ctx.to`), не `lastCacheKey` enter
- <span style="color:#39ff14;font-weight:bold">[x]</span> UPDATE (same viewKey): без render, patch path не сломан — `param-change-update.integration.test.ts`
- <span style="color:#39ff14;font-weight:bold">[x]</span> Transition in-place: stage + crossfade без double-teardown — `param-change-transition.integration.test.ts`
- <span style="color:#39ff14;font-weight:bold">[x]</span> Документировать `cache.dom` = loader cache + optional DOM keep-alive — [PRESERVE.md](../PRESERVE.md)
- <span style="color:#39ff14;font-weight:bold">[x]</span> Teardown hooks: `unmount` на exitRoutes (отдельная фаза `remount` не планируется)

---

## Одной фразой

**In-place remount реализован: outgoing-only teardown (`unmountParamChangeOutgoing`), unmount до commit, exit `domCacheKey` из ctx, UPDATE / FULL / transition in-place покрыты тестами. Публичные hooks — через `unmount="…"` на exit slice; отдельная фаза `remount` не будет.**

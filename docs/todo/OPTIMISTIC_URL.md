# Optimistic URL — политика history vs view

> **Статус:** <span style="color: #bf8700; font-weight: bold;">~ частично</span> (2026-07-05).  
> **As-is:** post-load history commit **до render** (`commitHistoryIfNeeded`).  
> **RFC открыт:** full optimistic (history до guards/load), rollback после early commit, demo/integration.  
> **Связь:** [MAIN_PIPELINE.md](../MAIN_PIPELINE.md) · [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) · [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) · [REPLACE_SUPERSEDE_ROLLBACK.md](./REPLACE_SUPERSEDE_ROLLBACK.md)

---

## TL;DR

| Было (до 2026-07) | Сейчас в коде | Ещё не сделано |
|-------------------|---------------|----------------|
| `pushState` в `commitNavigation()` **после** render | `commitHistoryIfNeeded()` **после** guards/load, **до** render | `pushState` сразу по клику (до guards) |
| URL отстаёт от DOM на plain-маршрутах | URL опережает render на sync-маршрутах без blocking load | Rollback URL при error/cancel **после** early commit |
| Shell sync только через `navigation` (post-commit) | `navigation-start` после history commit; nested URL **не** зависит от root-outlet DOM | Demo на `navigation-start`; integration e2e |

Текущая политика — **не** full optimistic из §A и **не** stage-until-commit из §B, а промежуточная: **«commit URL after blocking pre-render work»**.

---

## Зачем

При клике по `[data-router-link]` пользователь ожидает, что **адресная строка и активная ссылка** обновятся сразу — как при обычном переходе браузера.

Документ фиксирует:

1. исходную проблему (**render first, history second**);
2. что уже реализовано в движке;
3. две целевые политики (**optimistic URL** vs **stage-until-commit**) и оставшийся RFC.

---

## Историческая проблема (до post-load history commit)

### Симптом (демо и любой shell поверх `location.pathname`)

При in-app переходе на plain-маршруте (без transition):

1. **Контент во viewport уже новый** (страница B, профиль User 2, …).
2. **URL в адресной строке и UI-shell — ещё старый** (страница A, `/features/routing/users/1`, …).
3. Подсветка `aria-current` на nav-ссылках тоже отстаёт.

В demo (`src/examples/demo/main.ts`) это проявлялось как «URL на шаг позади», если синхронизировать UI через `MutationObserver` + `location.pathname`.

### Корневая причина (legacy)

Старый порядок:

1. **Processor** — guards → load → **`runRender`** (view commit в outlet).
2. **`commitNavigation()`** — `pushState` / `replaceState` + обновление `prev`.

| Шаг | Где | Что видит пользователь |
|-----|-----|------------------------|
| `runRender` → `mountContent(..., strategy: 'replace')` | pipeline | **Новый HTML уже в DOM** |
| `runAfterRender` → `commitStagedView()` | pipeline | Часто no-op (view уже replace) |
| `runAfterRender` → `commitNavigation()` | `aura-routing-engine.ts` | **Только здесь менялся URL** |

Рассинхрон — следствие модели **«render first, history second»** + **`replace` без staging** на enter-маршруте.

### Ловушки для UI-sync

- **`MutationObserver` на outlet** — может опережать или отставать от URL; для nested (User 1→2) root outlet часто **не мутирует** → observer **ненадёжен** для shell.
- **`pushState` не генерирует `popstate`** — слушатель `popstate` alone недостаточен после programmatic navigate.
- **Legacy:** при «render first, history second» nested переход давал рассинхрон и «залипание» URL в shell на observer. **As-is:** `commitHistoryIfNeeded` пишет URL **до** render/update и **не зависит** от root-outlet mutation; shell может синхронизироваться через `location` или **`navigation-start`**.

**Рекомендация для shell:** слушать **`navigation-start`** (URL уже записан) и **`navigation`** (view committed), не DOM mutation.

---

## As-is в коде (2026-07-05)

### Порядок pipeline

```text
guards → loads → commitHistoryIfNeeded → render (+ transitions) → commitNavigation (prev, callbacks)
```

| Путь | History commit | View commit |
|------|----------------|-------------|
| Full pipeline | `commitHistoryStep()` после load, до render | `runRender` → `runAfterRender` |
| Fast path (Tier 0) | `commitHistory()` до `runViewCommit` | без guards/load |
| Update shortcut | `commitHistoryStep()` после load, до `update` hooks | без render |

Код:

- `AuraRoutingEngine.commitHistoryIfNeeded()` — `pushState` / `replaceState`, idempotent (`historyCommitted`).
- `AuraRoutingEngine.commitNavigation()` — **без** повторного `pushState`: `prev`, scroll, `onNavigationCommitted`.
- `NavigationTransactionPipeline` — `commitHistory` / `commitHistoryStep`.

### Когда URL **не** пишется

- guard cancel / redirect, leave cancel;
- load error (history step не достигается);
- `action: pop` или `syncHistory: false`;
- `isSameNavigationTarget(from, to)`.

### Terminal policy после early commit

Если `historyCommitted === true` и навигация отменена/упала **до** view commit:

- **`shouldApplyTerminalHistoryPolicy`** → `false` для push/replace;
- URL **остаётся на target**, rollback **не** выполняется (см. комментарий в `navigateTo`).

Это сознательное решение на первом этапе; full optimistic RFC требует явной rollback-таблицы.

### События на `<aura-router>`

| Событие | Когда | Для shell |
|---------|-------|-----------|
| **`navigation-start`** | после `commitHistoryIfNeeded` | URL в `location` + `detail.pathname` — **до render** |
| **`navigation`** | после `commitNavigation` | view committed, scroll/restoration |

### Nested param change (User 1 → User 2) — engine <span style="color: #2ea043; font-weight: bold;">✓</span>

Layout `/users` остаётся LCA; меняется только leaf `:id` outlet. History commit идёт по `transaction.href`, **без** мутации root outlet:

| Case | Pipeline | History | Root outlet DOM |
|------|----------|---------|-----------------|
| A — same `viewKey` | `runUpdate` | после load, до `update` | часто без изменений |
| B/C — per-id remount | full | после load, до render nested leaf | без изменений |

Shell с `navigation-start` или `location.pathname` после history commit получает `/users/2` независимо от root-outlet observer.

Unit: `param-change-lifecycle.test.ts` (nested layout + synthetic remount). Demo/integration — см. §5 и критерии готовности.

### Mount / outlet (без изменений)

| Компонент | Поведение |
|-----------|-----------|
| `OutletStrategy` | `replace` (default) / `stage` (transitions) |
| `useStagedMount` | `true` только при transition policy на route |
| `html-src` routes | full pipeline; DOM на шаге `runRender` |

### Demo (`src/examples/demo/main.ts`)

**Legacy workaround:** `MutationObserver` на outlet + `queueMicrotask` на click + `popstate`.  
**Не подписан** на `navigation-start` / `navigation` — TODO §5.

### Тесты

- `test/navigation/commit-history.test.ts` — engine: push/replace, pop, same target, idempotency, finalize после early commit.
- `test/navigation/navigation-transaction-pipeline.test.ts` — порядок load → history → render; skip при guard/load failure; update path.
- `test/navigation/navigation-transaction-pipeline-fast-path.test.ts` — fast path вызывает history.
- `test/navigation/param-change-lifecycle.test.ts` — nested User 1→2: layout LCA, leaf remount / update без root DOM.

---

## Оставшиеся разрывы (почему RFC ещё открыт)

| Сценарий | Поведение as-is | Целевое (full optimistic) |
|----------|-----------------|---------------------------|
| Sync route, blocking guard | URL ждёт guard | URL сразу по клику |
| Async `load` / `html-src` | URL ждёт load | URL сразу; loading UI |
| Render error после history | URL на target, UI может не совпасть | rollback `replaceState(from)` или error UI + align |
| Cancel после history | URL сохраняется | product decision: preserve vs rollback |

---

## Две политики (выбор архитектуры)

### A. Optimistic URL (history first) — **RFC, не full as-is**

**Идея:** при клике (или старте transaction) **сразу** `pushState` на target href; контент догоняет асинхронно.

```text
click → pushState(target) → guards → load → render → (rollback URL on failure)
```

| Плюсы | Минусы |
|-------|--------|
| URL и nav-shell синхронны с намерением пользователя | При ошибке load/render URL уже «врёт» — нужен **rollback** |
| Привычное UX (MPA / многие SPA) | Back во время loading — особая политика |
| Не нужен observer на DOM | Два источника правды, пока render не завершён |

**As-is сегодня** — только второй шаг RFC: history **до render**, но **после** guards/load.

---

### B. Stage-until-commit (atomic commit) — **не выбрано**

**Идея:** новый view **не показывается**, пока transaction не успешна; URL и visible view меняются **в одной точке**.

```text
click → guards → load → render to stage (hidden) → commit stage + pushState
```

| Плюсы | Минусы |
|-------|--------|
| URL и видимый контент **никогда не расходятся** | Старый экран дольше при async `html-src` |
| Ошибка render — старый UI + старый URL | Loading template по умолчанию |
| Механизм есть для transitions (`stage` + `commitStage`) | Смена default mount policy |

---

## Предлагаемые шаги (TODO)

### 1. RFC: default navigation UX policy

- [ ] Зафиксировать product default: **optimistic** vs **stage-until-commit** vs **config flag** (`<aura-router history="optimistic|deferred">`).
- [ ] Описать matrix: sync content, async `html-src`, nested `:id` update, pop navigation.

### 2. Post-load history (первая итерация)

- [x] `commitHistoryIfNeeded` после guards/load, до render (`push` / `replace`, `syncHistory: true`).
- [x] Разделить address-bar write и `commitNavigation` (prev + callbacks).
- [x] Unit-тесты: порядок pipeline, skip при guard/load failure, update/fast path.
- [ ] Rollback URL в `finalizeError` / `finalizeCancelled` когда view не committed **и** product выбрал rollback.
- [ ] Integration: click → URL до render; failed load → URL не менялся; render fail после history → согласованность URL/UI.
- [ ] Обновить [POP_NAVIGATION.md](../POP_NAVIGATION.md) — asymmetry с optimistic push.

### 3. Full optimistic URL (если выбран §A)

- [ ] `pushState` в начале transaction (после match, **до** guards) для `action: push` + `syncHistory: true`.
- [ ] Back during in-flight — политика и тесты.

### 4. Stage-until-commit (альтернатива §B)

- [ ] Default `useStagedMount: true` для enter routes (или router-level flag).
- [ ] Loading template / inherited `loading-template` для async routes.
- [ ] Документировать в [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md).

### 5. Navigation events + demo

- [x] `navigation-start` после post-load history commit (`dispatchNavigationStart`).
- [x] `navigation` после view commit (`dispatchNavigationCommitted`).
- [ ] Обновить [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) — as-is семантика `navigation-start`.
- [ ] Demo: shell на `navigation-start` + `navigation` + `popstate`; убрать reliance на `MutationObserver` для URL.
- [x] Синхронизировать [MAIN_PIPELINE.md](../MAIN_PIPELINE.md) (post-load history до render; legacy `commitGate` ✗).

---

## Критерии готовности

### Engine

- [x] Plain sync route: URL обновляется **до** `runRender` (post-load history).
- [x] Guard cancel / load error: URL **не** меняется.
- [x] User 1 → User 2 (nested): URL и `navigation-start` **не зависят** от root-outlet mutation (`runUpdate` / full + `commitHistoryIfNeeded`).
- [ ] Failed navigation после early history: URL и UI согласованы (rollback или preserve — зафиксировано в RFC).

### Demo + integration

- [ ] Shell на `navigation-start` + `navigation` + `popstate` (без `MutationObserver` для URL).
- [ ] Первый клик: demo shell согласован с политикой.
- [ ] User 1 → User 2 (nested): e2e — shell обновляется при отсутствии root-outlet mutation.
- [ ] Integration tests + пункт в demo «Роутинг».

---

## Ссылки на код

- History commit: `src/modules/aura-routing-engine/core/aura-routing-engine.ts` — `commitHistoryIfNeeded`, `commitNavigation`, `navigateTo` (комментарий § порядок history).
- Pipeline: `src/modules/aura-routing-engine/core/navigation/navigation-transaction-pipeline.ts` — `commitHistoryStep`, `runRender`, `runAfterRender`, `runUpdate`, `runFastPipeline`.
- History policy: `src/modules/aura-routing-engine/core/history/history-policy.ts`.
- Mount: `src/modules/aura-route/core/view/outlet.ts` — `resolveStageStrategy`, `mountContent`.
- Router events: `src/modules/aura-router/core/navigation-events.ts` — `dispatchNavigationStart`, `dispatchNavigationCommitted`.
- Router wiring: `src/modules/aura-router/core/aura-router.ts` — `onNavigationHistoryCommitted`, `onNavigationCommitted`.
- Demo sync (legacy): `src/examples/demo/main.ts`.
- Tests: `commit-history.test.ts`, `navigation-transaction-pipeline.test.ts`, `param-change-lifecycle.test.ts`.

# Navigation events — аудит и roadmap

> **Статус:** отчёт (2026-06); реализация частичная.  
> **Эталон public API:** события на `<aura-router>` / `<aura-route>` — дополнение к [README](../../README.md), не замена hooks.  
> **Связь:** [NAVIGATION_ERROR_V2.md](../done/NAVIGATION_ERROR_V2.md) · [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md) · [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md)

---

## Зачем

Разработчикам нужен **наблюдаемый поток навигации** без погружения в pipeline:

- аналитика (page view после commit);
- global loading / progress bar;
- обработка cancel / redirect из guard;
- devtools и prefetch/cache метрики.

Сейчас наружу отдана в основном **ветка ошибок и 404**. Успешная навигация, cancel и redirect — только внутренние callbacks engine.

---

## Принципы (предлагаемые)

1. **Hooks — логика приложения; DOM events — подписчики снаружи** (analytics, shell, devtools). Не дублировать каждую hook-фазу событием.
2. **`<aura-router>`** — navigation-level (start, commit, complete, cancel, redirect, errors).
3. **`<aura-route>`** — route-level (loading, ready, activate/deactivate) только когда нужен scoped target.
4. **`navigation-commit` ≠ `navigation-complete`** — commit = history + view promoted; complete = terminal success после post-commit.
5. **NOT_FOUND** — отдельно от `navigation-error` (как сейчас).
6. **Prefetch / cache** — отдельная ось (`prefetch:*`, `aura-cache`), не смешивать с navigation stream.

---

## Что уже есть (public DOM)

### `<aura-router>`

Реализация: `src/modules/aura-router/core/navigation-events.ts`, wiring в `aura-router.ts`.

| Событие | Константа | Когда | `detail` | Cancelable |
|---------|-----------|-------|----------|------------|
| **`not-found`** | `AURA_ROUTER_NOT_FOUND` | Нет матча (fallback) или commit на `path="*"` | `url`, `router`, `source: 'route' \| 'fallback'` | только `source: 'fallback'` |
| **`navigation-error`** | `AURA_ROUTER_NAVIGATION_ERROR` | Сбой pipeline / load / render (не NOT_FOUND) | `error`, `code`, `phase`, `href`, `from`, `to`, `viewCommitted`, `router` | нет |
| **`navigation-hook-error`** | `AURA_ROUTER_NAVIGATION_HOOK_ERROR` | Упал hook из `error="…"` | `error`, `phase: 'error'`, `parent`, `router` | нет |

Коды ошибок (`navigation-error.code`): `NOT_FOUND`, `GUARD_THROW`, `HOOK_THROW`, `LOAD_FAILED`, `CONTENT_LOAD_FAILED`, `RENDER_FAILED`, `TRANSITION_FAILED`, `REENTER_FAILED`, `INTERNAL` — см. `failure/navigation-error.ts`.

Подписка (пример):

```ts
router.addEventListener('navigation-error', (e) => {
  const { code, phase, viewCommitted } = e.detail;
});
```

Документация: `src/modules/aura-router/README.md` § «События ошибок навигации».

### `<aura-route>`

Реализация: `src/modules/aura-route/core/view/plugins.ts` (при `loading-template` на route).

| Событие | Когда | `detail` | Cancelable |
|---------|-------|----------|------------|
| **`aura-route-loading`** | Старт render-pass (view resolve) | `{ pass }` | нет |

Побочный эффект (не event): класс `aura-route-loading` на `document.body` через plugin `loadingBodyClass`.

### Транспорт

`dispatchCustomEvent` (`aura-utils/misc/events.ts`): по умолчанию `bubbles: true`, `composed: true`, `cancelable: true` (для router-событий cancelable переопределяется).

---

## Что есть внутри, но не public

| Механизм | Где | Использование сейчас |
|----------|-----|----------------------|
| **`navigation:commit:end`** | engine bus | AuraRouter `onEngineEvent` → scroll / catch-all / DOM `navigation` |
| **`onNotFound`** | engine callback | прокси в DOM `not-found` |
| **`navigation:error`** | engine bus | AuraRouter `onEngineEvent` → DOM `navigation-error` |
| **Cancel / redirect** | `TransactionResult` `cancelled` / `redirect` | guard `false` или URL — **без события для приложения** |
| **`PrefetchIntentBus`** | `prefetch/intent/bus.ts` | внутренний fan-out intent |
| **`prefetch.onError`** | `PrefetchConfig` | callback pipeline, с router не связан |
| **Lifecycle hooks** | `AuraRouter.use()` | программный API |

---

## Что стоит добавить

### P0 — минимум для production-приложений

| Событие | Target | Когда | Зачем | Опора в коде |
|---------|--------|-------|-------|--------------|
| **`navigation-start`** | `<aura-router>` | Принят `NavigationRequest` (click, `navigate()`, popstate) | Global pending UI | Новое; точка входа coordinator |
| **`navigation-commit`** | `<aura-router>` | После commit gate: history + view promoted | Page view analytics, `document.title` | Обёртка над `onNavigationCommitted` |
| **`navigation-complete`** | `<aura-router>` | Terminal `navigationSucceeded` + post-commit hooks | «Всё готово» для shell | После pipeline finalize success |
| **`navigation-cancel`** | `<aura-router>` | `TransactionResult.status === 'cancelled'` | Убрать spinner; отличить от «ещё грузится» | `finalize.ts` case `cancelled` |
| **`navigation-redirect`** | `<aura-router>` | `TransactionResult.status === 'redirect'` | Логирование, audit | `finalize.ts` + `onRedirect` |

Предлагаемый `detail` для navigation-level (черновик):

```ts
interface NavigationEventDetailBase {
  router: HTMLElement;
  id: number;           // navigation job id
  href: string;         // requested URL
  from: string | null;  // pathname+search до навигации
  action: 'push' | 'replace' | 'pop';
}

// navigation-commit / navigation-complete — расширить:
// to: MatchedRouteInfo snapshot (pathname, search, pattern, params)
```

### P1 — UX, loading, prefetch

| Событие | Target | Зачем | Статус |
|---------|--------|-------|--------|
| **`aura-route-loaded`** (или `aura-route-loading-end`) | `<aura-route>` | Пара к `aura-route-loading` | ✗ |
| **`aura-route-ready`** | `<aura-route>` | View committed для leaf; аналог `ready` снаружи | ✗ |
| **`load:start` / `load:end`** | `<aura-router>` или bus | Индикатор данных без custom hooks | ✗ (только hooks) |
| **`navigation-pop`** | `<aura-router>` | Явный back/forward (`action === 'pop'`) | ✗ (scroll уже различает pop) |
| **`prefetch:start` / `prefetch:error`** | `<aura-router>` | Метрики, devtools | ✗; см. [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) |
| **`aura-cache`** | `document` / router | Cache hit/miss/evict | ✗ TODO в CACHE_DEVTOOLS |

### P2 — power users / nested / transitions

| Событие | Target | Зачем | Статус |
|---------|--------|-------|--------|
| **`route-activate` / `route-deactivate`** | `<aura-route>` | Nested lifecycle снаружи дерева | ✗ |
| **`transition-in:end` / `transition-out:end`** | `<aura-route>` или router | Интеграция с GSAP / View Transitions | ✗ (hooks) |
| **`search-change`** | `<aura-router>` | Query/hash без смены leaf | ✗; идея в comparison docs |
| **`cache:detach` / `cache:restore`** | `<aura-route>` | Keep-alive с `cache` | ✗ (hooks / future attrs) |
| **EventBus `navigation:*` / `load:*`** | engine internal | DevTools, state machine viz | ✗ — [EVENT_BUS.md](./EVENT_BUS.md) |

---

## Рекомендуемый минимальный public набор

**На `<aura-router>` (уже есть + P0):**

```text
not-found                 ✓
navigation-error          ✓
navigation-hook-error     ✓
navigation-start          ⬜ P0
navigation-commit         ⬜ P0
navigation-complete       ⬜ P0
navigation-cancel         ⬜ P0
navigation-redirect       ⬜ P0
```

**На `<aura-route>` (опционально):**

```text
aura-route-loading        ✓
aura-route-loaded         ⬜ P1
aura-route-ready          ⬜ P1
```

**Отдельная ось (не navigation):**

```text
prefetch:*                ⬜ P1
aura-cache                ⬜ P1 (CACHE_DEVTOOLS)
```

---

## Сознательно не добавлять

| Идея | Почему |
|------|--------|
| Event на каждую hook-фазу (`guard`, `load`, `leave`, …) | Дублирует `AuraRouter.use()`; шум в DOM |
| `navigation-error` для NOT_FOUND fallback | Уже `not-found`; два канала путают |
| `hooks` outcomes как events без стабильного `detail` | Сначала P0 navigation outcomes |
| Глобальный EventBus в production bundle | Tree-shaken devtools module; см. FUTURE_PROOF_ENGINE |

---

## Маппинг: исход навигации → события

| Исход pipeline | События сейчас | После P0 |
|----------------|----------------|----------|
| `navigationSucceeded` | (тихо; внутри `onNavigationCommitted`) | `navigation-commit` + `navigation-complete` |
| `cancelled` | (тихо) | `navigation-cancel` |
| `redirect` | (тихо; `onRedirect` → новая навигация) | `navigation-redirect` |
| `error` (не NOT_FOUND) | `navigation-error` | без изменений |
| NOT_FOUND fallback | `not-found` (cancelable) | без изменений |
| NOT_FOUND catch-all route | `not-found` (`source: 'route'`) | без изменений |
| error hook throw | `navigation-hook-error` | без изменений |

---

## Задачи реализации

### Фаза 1 — P0 на router

- ⬜ `navigation-events.ts`: константы + `dispatchNavigationCommit` и др.
- ⬜ Прокинуть из `onNavigationCommitted` → `navigation-commit`
- ⬜ `finalizeProcessorNavigation`: `navigation-cancel`, `navigation-redirect`
- ⬜ Coordinator entry → `navigation-start`
- ⬜ Terminal success → `navigation-complete` (после post-commit)
- ⬜ Тесты: `aura-router/test/navigation-events.test.ts`
- ⬜ `aura-router/README.md` + экспорт констант из пакета

### Фаза 2 — P1 route + loading pair

- ⬜ `aura-route-loaded` в `plugins.ts` (`onPassEnd`)
- ⬜ `aura-route-ready` после view commit leaf
- ⬜ Связать с [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) для prefetch/cache

### Фаза 3 — P2 / EventBus

Детальный план: **[EVENT_BUS.md](./EVENT_BUS.md)** (контракт `EngineEvent`, точки emit в processor/coordinator, fast path, EB0–EB4).

- ⬜ `core/events/event-bus.ts` + типы `navigation:*` / `load:*` / `node:*`
- ⬜ Emit в pipeline + `runFastPipeline()`; supersede не эмитит `finish` для старого job
- ⬜ `engine.events.subscribe()`; callbacks остаются для backward compat
- ⬜ DOM bridge (пересечение с P0 выше) — bus как source of truth
- ⬜ DevTools подписчик (zero cost в prod)

---

## Ссылки на код

| Файл | Роль |
|------|------|
| `src/modules/aura-router/core/navigation-events.ts` | DOM dispatch (errors, not-found) |
| `src/modules/aura-router/core/aura-router.ts` | Engine callbacks → events |
| `src/modules/aura-route/core/view/plugins.ts` | `aura-route-loading` |
| `src/modules/aura-routing-engine/core/commitHistoryIfNeeded / commitNavigation` | `onNavigationCommitted` |
| `src/modules/aura-routing-engine/core/navigation/finalize.ts` | cancel / redirect / error terminal |
| `src/modules/aura-utils/misc/events.ts` | `dispatchCustomEvent` helper |

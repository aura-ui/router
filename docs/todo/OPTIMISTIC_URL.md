# Optimistic URL — политика history vs view

> **Статус:** TODO / RFC (2026-07).  
> **Связь:** [MAIN_PIPELINE.md](../MAIN_PIPELINE.md) · [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) · [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) · [REPLACE_SUPERSEDE_ROLLBACK.md](./REPLACE_SUPERSEDE_ROLLBACK.md)

---

## Зачем

При клике по `[data-router-link]` пользователь ожидает, что **адресная строка и активная ссылка** обновятся сразу — как при обычном переходе браузера. Сейчас движок по умолчанию делает наоборот: **контент часто виден раньше, чем `pushState`**.

Этот документ фиксирует текущую проблему, две возможные политики (**optimistic URL** vs **stage-until-commit**) и критерии выбора.

---

## Текущая проблема

### Симптом (демо и любой shell поверх `location.pathname`)

При первом клике по in-app ссылке:

1. **Контент во viewport уже новый** (страница B, профиль User 2, …).
2. **URL в адресной строке и UI-shell — ещё старый** (страница A, `/features/routing/users/1`, …).
3. Подсветка `aria-current` на nav-ссылках тоже отстаёт.

В demo (`src/examples/demo/main.ts`) это проявилось как «URL всегда на один шаг позади», если синхронизировать UI через `MutationObserver` + `location.pathname`.

### Корневая причина — порядок в pipeline

Документированный порядок в `AuraRoutingEngine.navigateTo`:

1. **Processor** — guards → load → **`runRender`** (view commit в outlet).
2. **`commitNavigation()`** — `pushState` / `replaceState` + обновление `prev`.

Фактически для большинства plain-маршрутов (без transition):

| Шаг | Где | Что видит пользователь |
|-----|-----|------------------------|
| `runRender` → `route.render()` → `mountContent(..., strategy: 'replace')` | `navigation-transaction-pipeline` | **Новый HTML уже в DOM** |
| `runAfterRender` → `commitStagedView()` | pipeline | Часто no-op (view уже replace) |
| `runAfterRender` → `commitNavigation()` | `aura-routing-engine.ts` | **Только здесь меняется URL** |

То есть рассинхрон **не баг `pushState`**, а следствие модели **«render first, history second»** + **`replace` без staging** на enter-маршруте.

### Дополнительные ловушки для UI-sync

- **`MutationObserver` на outlet** срабатывает на шаге render — **до** `commitNavigation`.
- **`pushState` не генерирует `popstate`** — слушатель `popstate` alone не помогает после programmatic navigate.
- **Вложенные маршруты:** при User 1 → User 2 меняется **внутренний** `<aura-outlet>`, верхний outlet может **не мутировать** → observer на root outlet не срабатывает, URL в shell «залипает» навсегда.

### Временный workaround в demo (2026-07)

- Событие **`navigation`** на `<aura-router>` (`AURA_ROUTER_NAVIGATION`) — диспатч **после** `commitNavigation`.
- Demo подписывается на `navigation` и берёт `detail.pathname`, а не `location` на DOM-mutation.

Это **не устраняет** рассинхрон «контент новый / URL старый» для пользователя — только чинит shell, который читал URL слишком рано.

---

## Две политики (выбор архитектуры)

### A. Optimistic URL (history first)

**Идея:** при клике (или старте transaction) **сразу** `pushState` на target href; контент догоняет асинхронно.

```
click → pushState(target) → guards → load → render → (rollback URL on failure)
```

| Плюсы | Минусы |
|-------|--------|
| URL и nav-shell синхронны с намерением пользователя | При ошибке load/render URL уже «врёт» — нужен **rollback** `replaceState(from)` |
| Привычное UX (как MPA / многие SPA) | Back во время loading может требовать особой политики |
| Не нужен observer на DOM | Два источника правды, пока render не завершён |

**Rollback:** при `cancelled` / `error` до view commit — `history.replaceState(from.href)` (см. комментарии в `navigateTo` про pop-asymmetry). Нужна явная таблица policy в `history-policy.ts`.

**Аналоги:** Remix/React Router (часто optimistic), классические MPA.

---

### B. Stage-until-commit (atomic commit)

**Идея:** новый view **не показывается**, пока transaction не успешна; URL и visible view меняются **в одной точке** — `commitStagedView()` + `commitNavigation()`.

```
click → guards → load → render to stage (hidden) → commit stage + pushState
```

| Плюсы | Минусы |
|-------|--------|
| URL и видимый контент **никогда не расходятся** | Пользователь дольше видит **старый** экран при async `html-src` |
| Ошибка render — старый UI + старый URL | Нужен loading UI / skeleton по умолчанию |
| Механизм уже есть для transitions (`stage` + `commitStage`) | Изменение default mount policy для всех маршрутов |

**Аналоги:** строгий «transactional UI»; близко к текущему transition-path, но как **default**, не только для `fade`/`slide`.

---

## As-is в коде

| Компонент | Поведение |
|-----------|-----------|
| `OutletStrategy` | `replace` (default) / `stage` (transitions) |
| `useStagedMount` | `true` только при transition policy на route |
| `runAfterRender` | `commitStagedView()` → `commitNavigation()` |
| `html-src` routes | `hasAsyncContent` → full pipeline; DOM на шаге `runRender` |
| Public sync | `navigation` event после commit (demo workaround) |

---

## Предлагаемые шаги (TODO)

### 1. RFC: default navigation UX policy

- [ ] Зафиксировать product default: **optimistic** vs **stage-until-commit** vs **config flag** на `<aura-router history="optimistic|deferred">`.
- [ ] Описать matrix: sync content, async `html-src`, nested `:id` update, pop navigation.

### 2. Optimistic URL (если выбран)

- [ ] `pushState` в начале transaction (после match, до render) для `action: push` + `syncHistory: true`.
- [ ] Rollback URL в `finalizeError` / `finalizeCancelled` когда view не committed.
- [ ] Тесты: click → URL immediate; failed load → URL restored; back during in-flight.
- [ ] Обновить [POP_NAVIGATION.md](../POP_NAVIGATION.md) — asymmetry с optimistic push.

### 3. Stage-until-commit (альтернатива)

- [ ] Default `useStagedMount: true` для enter routes (или router-level flag).
- [ ] Loading template / inherited `loading-template` как рекомендуемый UX для async routes.
- [ ] Документировать в [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md).

### 4. Navigation events (независимо от политики)

- [ ] Расширить [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md): `navigation` (commit) ✓, добавить `navigation-start` с target href для shell до render.
- [ ] Не рекомендовать sync по DOM mutation.

### 5. Demo

- [ ] Shell слушает только `navigation` + `popstate` (сделано).
- [ ] После выбора политики — убрать пояснение «URL отстаёт» или заменить на демо loading state.

---

## Критерии готовности

- [ ] Первый клик по `[data-router-link]`: **URL, active link и контент** согласованы с выбранной политикой (optimistic: URL сразу; staged: URL и контент вместе на commit).
- [ ] User 1 → User 2 (nested): shell обновляется без root-outlet mutation.
- [ ] Failed navigation: URL и UI согласованы (rollback или preserve).
- [ ] Integration tests + пункт в demo «Роутинг».

---

## Ссылки на код

- History commit: `src/modules/aura-routing-engine/core/aura-routing-engine.ts` — `commitNavigation`, `navigateTo` (комментарий § порядок history).
- Pipeline: `src/modules/aura-routing-engine/core/navigation/navigation-transaction-pipeline.ts` — `runRender`, `runAfterRender`.
- Mount: `src/modules/aura-route/core/view/outlet.ts` — `resolveStageStrategy`, `mountContent`.
- Demo sync: `src/examples/demo/main.ts` — `AURA_ROUTER_NAVIGATION`.
- Event: `src/modules/aura-router/core/navigation-events.ts` — `dispatchNavigationCommitted`.

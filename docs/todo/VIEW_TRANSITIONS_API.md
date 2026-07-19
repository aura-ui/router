# View Transitions API — переход с Web Animations на engine-обёртку

> **Статус:** <span style="color: #cf222e; font-weight: bold;">✗</span> не сделано · **фаза 7**  
> **Последнее обновление:** 2026-06-30  
> **Связанные документы:** [FUTURE_PROOF_ENGINE.md §2](../FUTURE_PROOF_ENGINE.md), [IMPLEMENTATION_STEPS.md §фаза 7](../IMPLEMENTATION_STEPS.md), [TRANSITION_PRESENTATION_CORE.md](./TRANSITION_PRESENTATION_CORE.md)

---

## TL;DR

| | Сейчас | Цель |
|---|--------|------|
| Анимация смены view | Demo: **Web Animations API** в хуках (`view-transition.hook.ts`) | **View Transitions API** (`document.startViewTransition`) в engine |
| Commit DOM | Staged render → `commitStagedView()` — атомарно, без мерцания | Тот же commit, обёрнутый в `startViewTransition(() => commit())` |
| Стили перехода | JS keyframes (`opacity`, `transform`) | CSS `view-transition-name`, `::view-transition-*` pseudo-elements |
| Оркестрация | Фазы `transitionOut` / `transitionIn` + hooks | VT wrapper **поверх** commit point; hooks — opt-in / legacy |

**Зачем:** нативные crossfade / shared-element transitions без ручного поиска `[aura-view-root]` и без дублирования логики анимации в каждом приложении.

---

## Контекст

### Что такое View Transitions API

Браузерный API: `document.startViewTransition(callback)`:

1. Делает снимок текущего DOM (old state).
2. Выполняет `callback` — синхронные DOM-изменения.
3. Делает снимок нового DOM (new state).
4. Анимирует переход между снимками (по умолчанию crossfade; кастомизация через CSS).

Поддержка: Chromium (stable), Safari 18+, Firefox — за флагом / в процессе. Engine обязан иметь **fallback** без API.

### Что уже готово в engine

Commit point спроектирован как единая точка смены снимка — см. [FUTURE_PROOF_ENGINE.md §2](../FUTURE_PROOF_ENGINE.md):

```text
guards → loads → runRenderWithTransition → after
                                              ├─ commitEnterViews (DOM promote)
                                              ├─ commitGate (history + prev)
                                              ├─ left (exit cleanup)
                                              └─ after hooks
```

Ключевые файлы:

| Компонент | Путь |
|-----------|------|
| Staged render + promote | `navigation/navigation-transaction-pipeline.ts` → `runRender()` / `commitEnterViews()` |
| Commit gate | `commitHistoryIfNeeded / commitNavigation` → `applyCommitGate()` |
| Transition policy (`out-in` / `in-out` / `parallel`) | `processor-pipeline.ts` → `RENDER_ORDER_STEPS` |
| Route attrs `transition`, `transition-order` | `aura-route/core/attr/transition-attr-parser.ts` |

### Что есть в demo (не engine)

`src/examples/demo/hooks/view-transition.ts` — хуки `fade` / `slide` (см. [TRANSITION_PRESENTATION_CORE.md](./TRANSITION_PRESENTATION_CORE.md)):

- Ищут `[aura-view-root]` в outlet.
- На фазах `transitionOut` / `transitionIn` вызывают `element.animate()`.
- Учитывают `AbortSignal` навигационного job.

Это **прикладной слой**, не платформенная обёртка. После внедрения VT wrapper demo можно перевести на CSS transitions или оставить hooks как legacy.

---

## Целевая архитектура

### Идея

```ts
async function commitNavigationDom(): Promise<void> {
  commitEnterViews();
  // commitGate вызывается сразу после promote (как сейчас)
}

async function commitWithOptionalViewTransition(): Promise<void> {
  const startVT = document.startViewTransition?.bind(document);

  if (!startVT || !shouldUseViewTransitions(ctx)) {
    commitEnterViews();
    pipelineContext.commitGate?.();
    return;
  }

  const transition = startVT(() => {
    commitEnterViews();
    pipelineContext.commitGate?.();
  });

  await transition.finished;
}
```

> **Важно:** `startViewTransition` callback должен менять DOM **синхронно**. Async work (loads, fetch view) остаётся **до** render/commit — как сейчас.

### Где вешать wrapper

Предпочтительная точка — **один вызов** вокруг пары `commitEnterViews` + `commitGate` в `runAfterRender()` (и аналог в `runFastPipeline()`, если fast path должен поддерживать VT).

Не дублировать VT на каждый nested outlet: один transition на navigation commit, если не задана политика per-outlet (см. открытые вопросы).

### Связь с transition policy

Сейчас pipeline разделяет render и анимацию:

| `transition-order` | Порядок фаз |
|--------------------|-------------|
| `out-in` | `transitionOut` → `render` → `transitionIn` → commit |
| `in-out` | `render` → `transitionIn` → `transitionOut` → commit |
| `parallel` | `render` → параллельно `transitionOut` + `transitionIn` → commit |

**View Transitions API** анимирует момент **DOM update в callback**. Это ближе к crossfade на commit, а не к пофазным hook-анимациям.

Варианты сосуществования (выбрать при реализации):

1. **VT заменяет hook-фазы** — при включённом VT `transitionOut`/`transitionIn` hooks не вызываются (или no-op), стили только CSS.
2. **VT + hooks** — hooks для micro-анимаций внутри view, VT для смены страницы (сложнее, риск двойной анимации).
3. **Рекомендация для v1:** opt-in VT на router; при VT — `transition=""` hooks игнорируются с dev-warning.

### API surface (черновик)

| Уровень | Атрибут / опция | Поведение |
|---------|-----------------|-----------|
| `<aura-router>` | `view-transition="auto"` | VT если `document.startViewTransition` есть |
| | `view-transition="off"` | только commit (default) |
| `<aura-route>` | наследование + override | per-route отключение / включение |
| Engine | `prefers-reduced-motion` | отключать VT |

Имена атрибутов — черновик; согласовать с существующим `transition="fade"` (hook names), чтобы не путать **hook package** и **platform VT**.

---

## План внедрения

### VT0 — Spike / контракт

- [ ] Зафиксировать: VT оборачивает только `commitEnterViews` + `commitGate` или весь `runAfterRender`.
- [ ] Решить взаимодействие с `transition-order` и hook-фазами (см. выше).
- [ ] Минимальный demo: crossfade через CSS без `view-transition.hook.ts`.

### VT1 — Engine wrapper

- [ ] `view-transition.ts` (или `navigation/view-transition-commit.ts`): `commitWithViewTransition(commitFn, options)`.
- [ ] Feature detect + fallback.
- [ ] Интеграция в `NavigationTransactionPipeline.runAfterRender()`.
- [ ] `prefers-reduced-motion: reduce` → skip VT.

### VT2 — Публичный API

- [ ] Атрибуты на `<aura-router>` / `<aura-route>`.
- [ ] Документация + пример CSS (`view-transition-name` на `[aura-view-root]`).
- [ ] Обновить demo: VT вместо Web Animations hooks (или второй пример).

### VT3 — Краевые случаи

- [ ] Fast path: VT только если `canUseFastPath` и политика разрешает.
- [ ] Отмена job во время `transition.finished` — `transition.skipTransition()` / abort handling.
- [ ] Nested routes: один root transition vs per-outlet (решение из VT0).
- [ ] Тесты: mock `document.startViewTransition`, assert call order commit → gate.

### VT4 — EventBus (опционально, фаза 7)

- [ ] `navigation:view-transition:start` / `navigation:view-transition:end` для аналитики и devtools.

---

## CSS-пример (целевой UX)

```css
[aura-view-root] {
  view-transition-name: route-view;
}

::view-transition-old(route-view),
::view-transition-new(route-view) {
  animation-duration: 0.25s;
  animation-timing-function: ease;
}
```

Shared element (например, заголовок layout при смене child):

```css
.settings-header {
  view-transition-name: settings-header;
}
```

---

## Открытые вопросы

1. **Имя атрибута** — `view-transition` vs переиспользование `transition` (сейчас = hook names).
2. **Commit gate внутри callback** — history/prev синхронно с DOM promote (текущий порядок); проверить, что `transition.finished` не ломает scroll/hash timing.
3. **Parallel policy** — VT по сути один crossfade; `parallel` + VT — deprecated combo или отдельная семантика?
4. **SSR / no document** — guard в non-browser окружениях.
5. **Миграция demo hooks** — удалить или оставить как «custom transition package» для браузеров без VT.

---

## Критерии готовности

- [ ] Навигация A→B с `view-transition="auto"` использует `document.startViewTransition` когда API доступен.
- [ ] Без API — поведение идентично текущему commit (без регрессий).
- [ ] Нет мерцания между old/new view (regression test на staged commit).
- [ ] `prefers-reduced-motion` отключает VT.
- [ ] Документирован контракт для приложений (CSS, attrs, ограничения с hooks).

---

## Журнал

| Дата | Изменение |
|------|-----------|
| 2026-06-30 | Создан todo-документ: контекст, целевая архитектура, план VT0–VT4 |

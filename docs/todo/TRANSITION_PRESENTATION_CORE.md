# TODO: общие стили и presentation-слой transition в core

> **Статус:** <span style="color: #cf222e; font-weight: bold;">✗</span> не сделано  
> **Последнее обновление:** 2026-07-06  
> **Связанные документы:** [TRANSITION_ANIMATION_TESTS.md](./TRANSITION_ANIMATION_TESTS.md), [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md), [PLUGINS.md](../PLUGINS.md), [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md)

---

## TL;DR

| | Сейчас (engine) | Сейчас (demo) | Цель в core |
|---|-----------------|---------------|-------------|
| **Оркестрация** | `transition-order`, staged mount, фазы `transitionOut` / `transitionIn` | — | без изменений |
| **CSS stacking** | нет | `demo-outlet.css`: absolute overlay для 2-го `[data-aura-view-root]` | shipped baseline CSS для crossfade |
| **Скрытие staged incoming** | нет | `[data-demo-staged]` + `demo-view-entering` | engine-managed attr/class на view root |
| **Анимация** | нет built-in hooks | `fade` / `slide` (WAAPI) в `view-transition.ts` | reference hooks + утилиты в пакете |
| **Cleanup** | `resetViewRootPresentation` (inline opacity/transform, cancel animations) | `clearPresentation` + demo-классы | единый reset presentation API |

**Зачем документ:** зафиксировать, что reference-реализация crossfade сейчас живёт в demo и **требует прикладного CSS**, которого в core нет — из-за этого «анимация в JS есть, визуально не видна».

---

## Разделение ответственности

```text
┌─────────────────────────────────────────────────────────────┐
│  Engine (aura-routing-engine + aura-outlet)                 │
│  • staged mount: 2 × [data-aura-view-root] в outlet         │
│  • transition-order → порядок фаз                             │
│  • commitStagedView / unmount timing                        │
│  ✗ нет CSS stacking, нет shipped hooks                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌─────────────────────┐           ┌─────────────────────────┐
│ Presentation CSS    │           │ Transition hooks (app)  │
│ (сейчас demo-only)  │           │ fade, slide, GSAP, VT API │
│ overlay, staged hide│           │ WAAPI / CSS classes       │
└─────────────────────┘           └─────────────────────────┘
```

Core отвечает за **когда** два view root в DOM; приложение (или будущий presentation-модуль core) — за **как** они выглядят при crossfade.

> Отдельная линия — [View Transitions API](./VIEW_TRANSITIONS_API.md) (`document.startViewTransition`): обёртка вокруг commit point, не замена staged WAAPI hooks.

---

## Что уже сделано в demo (reference, не в core)

Сценарий: `public/features/animations/`, хуки подключаются из `src/examples/demo/main.ts`.

### 1. CSS — crossfade stacking (`public/demo-outlet.css`)

**Проблема без этого правила:** `applyStage` добавляет incoming как **второй** sibling в потоке (`position: static`). Outgoing занимает viewport, incoming анимируется **ниже fold** — виден только fade-out, входящий «всплывает» в конце после `unmount`.

**Исправление в demo:**

```css
/* outgoing в потоке (задаёт высоту outlet), incoming поверх */
.demo-root-outlet > [data-aura-view-root] + [data-aura-view-root] {
  position: absolute;
  inset: 1.25rem; /* = padding outlet */
  z-index: 1;
}
```

Дополнительно — скрытие staged incoming до `transitionIn` (без конфликта с WAAPI после старта хука):

```css
.demo-root-outlet > [data-aura-view-root][data-demo-staged]:not(.demo-view-entering) {
  opacity: 0;
  transform: translate3d(2.25rem, 0, 0);
  pointer-events: none;
}
```

`prefers-reduced-motion` — показ без скрытия.

### 2. JS — маркировка staged view (`view-transition.ts`)

`installDemoStagedViewObserver` — `MutationObserver` на outlet:

- при 2+ roots последний получает `data-demo-staged`, пока нет класса `demo-view-entering`;
- снимается в `primeEnterRoot` перед WAAPI.

Это **обходной путь**: engine не выставляет presentation-state на view root.

### 3. JS — хуки `fade` / `slide` (WAAPI)

| Часть | Поведение |
|-------|-----------|
| `resolveTransitionRoot` | `transitionOut` → `roots[0]`, `transitionIn` → `roots[roots.length - 1]` |
| `primeEnterRoot` | класс `demo-view-entering`, inline start pose, 2× `rAF` |
| `runEnterPresentationAnimation` | **две** параллельные анимации: opacity (`ease-out`) + transform (мягкий easing) — fade виден с начала, не только сдвиг |
| `runPresentationAnimation` | exit: одна анимация opacity + transform |
| `transactionSignal` | `abort` → `animation.cancel()` |
| finalize | enter: `hold-visible` (opacity 1); exit: сброс inline |

Константы: `FADE_IN_MS = 520`, `FADE_OUT_MS = 300`, сдвиг `2.25rem` / `-0.875rem`.

### 4. Что в engine уже есть (минимум)

| Файл | Что делает |
|------|------------|
| `aura-outlet` `applyStage` | append второго `[data-aura-view-root]` |
| `navigation-transaction-pipeline` | `parallel` / `out-in` / `in-out` |
| `view-teardown-pipeline` | `resetViewRootPresentation` — сброс inline opacity/transform, cancel `getAnimations()` |

`resetViewRootPresentation` **не знает** про demo-классы (`demo-view-entering`, `data-demo-staged`).

---

## Что добавить в core

### P0 — presentation CSS (обязательно для crossfade «из коробки»)

Shipped stylesheet (кандидаты: `aura-outlet/transitions.css`, opt-in import `@auraui/router/transitions.css`):

1. **Outlet as stacking context** — `aura-outlet` или attr `data-aura-transition` → `position: relative`.
2. **Overlay для staged incoming** — селектор по второму direct child `[data-aura-view-root]` (без demo-префиксов):

   ```css
   aura-outlet[data-aura-staging] > [data-aura-view-root] + [data-aura-view-root] {
     position: absolute;
     inset: 0;
     z-index: 1;
   }
   ```

3. **Скрытие до `transitionIn`** — attr `data-aura-staged` (engine-managed, не demo-specific):

   ```css
   [data-aura-view-root][data-aura-staged]:not([data-aura-entering]) {
     opacity: 0;
     pointer-events: none;
   }
   ```

4. **CSS variables** для кастомизации без форка:

   ```css
   aura-outlet {
     --aura-transition-in-duration: 520ms;
     --aura-transition-out-duration: 300ms;
     --aura-transition-in-offset: 2.25rem;
   }
   ```

5. **`prefers-reduced-motion`** — отключение transform/opacity hide.

**Критерий готовности:** demo переводится на core CSS; `demo-outlet.css` оставляет только визуализацию рамок/лейблов, не логику crossfade.

### P1 — engine-managed presentation state

Убрать demo `MutationObserver`:

| Событие | Действие engine / outlet |
|---------|--------------------------|
| `applyStage` | `data-aura-staged` на incoming root; `data-aura-staging` на outlet |
| начало `transitionIn` (hook context или route callback) | `data-aura-entering`, снять `data-aura-staged` |
| `commitStagedView` / `unmount` / `revertInFlightView` | снять attrs, вызвать `resetViewRootPresentation` |

Опционально: событие `aura-staging-change` на outlet для devtools.

### P2 — reference hooks в пакете (не в demo)

Вынести из `src/examples/demo/hooks/view-transition.ts`:

```
src/modules/aura-transitions/   (или plugins/transitions/)
  core/
    resolve-transition-root.ts
    presentation-animation.ts   // runEnter / runExit, signal, reduced-motion
    reset-presentation.ts       // расширить resetViewRootPresentation
  hooks/
    fade.ts
    slide.ts
  styles/
    transitions.css
  index.ts                      // AuraRouter.use(fade), import CSS
```

Demo остаётся тонкой обёрткой: `installDemoTransitionHooks()` → import from package.

### P3 — тесты

См. [TRANSITION_ANIMATION_TESTS.md](./TRANSITION_ANIMATION_TESTS.md):

- integration с **реальными** hooks (не mock `runPhaseHooks`);
- jsdom: 2 roots в outlet + computed stacking (absolute на incoming);
- supersede mid-animation → presentation reset;
- `prefers-reduced-motion` stub.

### P4 — nested outlet

Текущий demo CSS только для **корневого** outlet. Для nested crossfade — те же правила на `aura-outlet[data-aura-staging]` внутри layout, политика z-index / `findNestedOutlet` during transition (см. `aura-outlet.test.ts` «findNestedOutlet prefers staged layout»).

---

## Миграция demo → core (чеклист)

- [ ] `transitions.css` в пакете, opt-in import
- [ ] `data-aura-staging` / `data-aura-staged` / `data-aura-entering` — engine или outlet adapter
- [ ] Удалить `installDemoStagedViewObserver` и `data-demo-staged`
- [ ] Перенести `fade` / `slide` hooks в `aura-transitions`
- [ ] Demo: `transition="fade"` без дублирования CSS stacking
- [ ] Документировать в [PLUGINS.md](../PLUGINS.md) и README пакета
- [ ] Тесты P3

---

## Открытые вопросы

1. **Inset 0 vs padding outlet** — demo использует `inset: 1.25rem` из-за padding на `.demo-root-outlet`. Core CSS должен использовать `inset: 0` относительно content box outlet или document convention «outlet без padding».
2. **CSS-only vs WAAPI** — shipped CSS достаточно для hide/stack; анимация остаётся в hooks. Альтернатива: CSS `@starting-style` + `transition` на `[data-aura-entering]` (меньше JS, сложнее cancel/supersede).
3. **Связь с View Transitions API** — при включённом VT baseline CSS может быть no-op; нужна политика `transition=presentation|view-transitions|none`.

---

## Ссылки на код (as-is)

| Назначение | Путь |
|------------|------|
| Demo hooks | `src/examples/demo/hooks/view-transition.ts` |
| Demo CSS stacking | `public/demo-outlet.css` (секция «Crossfade») |
| Animations demo | `public/features/animations/` |
| Staged mount | `src/modules/aura-outlet/core/aura-outlet.ts` → `applyStage` |
| Pipeline | `src/modules/aura-routing-engine/core/navigation/navigation-transaction-pipeline.ts` |
| Presentation reset | `src/modules/aura-route/core/view/view-teardown-pipeline.ts` |

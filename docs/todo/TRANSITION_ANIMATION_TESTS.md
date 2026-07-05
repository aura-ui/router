# TODO: тесты transition-анимаций (CSS / GSAP / Web Animations)

> **Статус:** <span style="color: #cf222e; font-weight: bold;">✗</span> не сделано  
> **Последнее обновление:** 2026-07-06  
> **Связанные документы:** [PLUGINS.md](../PLUGINS.md), [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md), [IN_PLACE_REMOUNT.md](./IN_PLACE_REMOUNT.md), [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md), [REPLACE_SUPERSEDE_ROLLBACK.md](./REPLACE_SUPERSEDE_ROLLBACK.md)

---

## TL;DR

| | Сейчас | Не покрыто |
|---|--------|------------|
| **Engine** | Порядок фаз, staged DOM (2 слоя → 1), unmount timing, param remount vs cross-route | — |
| **Hooks registry** | Замокан в integration-тестах (`runPhaseHooks: jest.fn()`) | Реальный запуск `fade-in` / `fade-out` и т.п. |
| **Анимация** | Строки `['fade-in']` на route — только metadata | CSS-классы, `transitionend`, GSAP tweens, `element.animate()` |
| **Cleanup** | Unit: `resetViewRootPresentation` (opacity/transform/`getAnimations().cancel()`) | Cancel mid-flight при supersede + реальный running animation |

**Зачем документ:** зафиксировать, что текущие transition integration-тесты **намеренно** проверяют оркестрацию и DOM-staging, а не визуальную анимацию — и где добавлять тесты, когда появятся reference hooks или View Transitions wrapper.

---

## Разделение ответственности

```text
┌─────────────────────────────────────────────────────────────┐
│  Engine (aura-routing-engine)                               │
│  • transition-order: parallel | out-in | in-out               │
│  • runRenderWithTransition → фазы transitionOut/In          │
│  • staged mount (2 view roots в outlet)                       │
│  • unmount → commitStaged → commitNavigation → ready          │
└──────────────────────────┬──────────────────────────────────┘
                           │ вызывает фазу + hook names
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Hook registry + app plugins (AURARouter.use)               │
│  • fade-in, slide, gsap-fade, …                             │
│  • CSS classes, inline styles, GSAP, Web Animations API     │
│  • await animation complete (blocking / postCommit policy)  │
└─────────────────────────────────────────────────────────────┘
```

Core **не содержит** built-in реализаций `fade-in` / `fade-out`. В тестах это placeholder-имена hooks. Анимация — прикладной слой ([PLUGINS.md](../PLUGINS.md), demo hooks).

---

## Что уже покрыто (и этого достаточно для engine)

### Integration: lifecycle + DOM-слои

| Файл | Что проверяет |
|------|----------------|
| `param-change-transition.integration.test.ts` | In-place param remount + transition: parallel crossfade (2 слоя в хуках), out-in / in-out порядок, unmount snapshot, `preserve.view` + parallel + stash |
| `cross-route-transition.integration.test.ts` | `/from` → `/to`: crossfade, exit unmount snapshot, out-in, без transition |
| `param-change-remount.integration.test.ts` | Remount без transition, `preserve.view` round-trip |
| `param-change-update.integration.test.ts` | UPDATE: тот же DOM-узел, без re-render |

### Unit / pipeline

| Файл | Что проверяет |
|------|----------------|
| `navigation-transaction-pipeline.test.ts` | Порядок фаз, `unmount → commitStaged`, param remount + transition (mock render) |
| `outlet.test.ts` | `unmountParamChangeOutgoing` vs `unmountOnLeave`, post-render sequence |
| `view-controller.test.ts` | Param remount + parallel staging, stash |
| `transition/resolve.test.ts` | Парсинг attrs `transition`, `transition-order`, inherit |

### Техника текущих integration-тестов

1. **`runPhaseHooks` замокан** — registry не вызывается; проверяется только то, что pipeline **дошёл** до фазы.
2. **Route callbacks** `onTransitionOut` / `onTransitionIn` — шпионы для DOM в момент фазы (`outlet.children.length`, `querySelector`, snapshot `isConnected` **до** teardown).
3. **Имена hooks** `['fade-in']`, `['fade-out']` — декоративные; на поведение тестов не влияют.

Это **корректная** стратегия для engine: «актеры на сцене в нужный момент», без проверки «fade-in отработал».

---

## Чего нет (дыры покрытия анимационного слоя)

### 1. Reference animation hooks в репозитории

Нет shipped hooks вида:

```typescript
// hooks/fade-in.hook.ts (условный)
async function fadeIn(ctx) {
  root.classList.add('fade-enter');
  await waitForTransitionEnd(root);
}
```

Без reference implementation нечего тестировать на уровне «реальная анимация».

### 2. Integration с живым `HookRegistry`

Тест с **не** замоканным `runPhaseHooks`:

- зарегистрировать hook через `defaultHookRegistry` / `AURARouter.use`;
- navigation end-to-end;
- assert: hook вызван с правильным `ctx.phase`, `ctx.route`, outlet element.

### 3. CSS / timing

- класс добавлен / снят в нужной фазе;
- `getComputedStyle` (`opacity`, `transform`) mid-flight и после;
- pipeline **ждёт** `transitionend` / `animationend` (blocking hook policy);
- fake timers + `requestAnimationFrame` для детерминизма.

### 4. GSAP

- mock или lightweight stub `gsap.to`;
- tween на правильном view root;
- unmount / supersede не оставляет «висящий» tween;
- `revertInFlightView` → kill tweens (если hook это поддерживает).

### 5. Web Animations API

Demo-слой (`view-transition.hook.ts` в examples) — `element.animate()`:

- `getAnimations().length > 0` mid-flight;
- `resetViewRootPresentation` отменяет animations при cancel;
- связка с staged DOM (анимация на outgoing **и** incoming одновременно при parallel).

### 6. View Transitions API

Отдельный track — [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md). Тесты VT (feature detection, fallback, `::view-transition-*`) не дублировать здесь; только cross-link.

### 7. E2E / visual

Playwright, screenshot diff, реальные `@keyframes` — опционально, flaky в CI; вынести в demo/e2e job, не в unit suite.

### 8. Transition failure / cancel с running animation

- supersede navigation mid-tween;
- `revertInFlightView` + проверка, что presentation сброшен (`resetViewRootPresentation`);
- outlet не в «полупрозрачном» состоянии после cancel.

---

## Предлагаемые уровни тестов (когда делать)

### Уровень A — Hook unit (первый приоритет)

**Где:** `src/examples/demo/hooks/` или `src/modules/aura-router/test/hooks/` (если hooks войдут в пакет).

**Пример scope:**

- `fade.hook.test.ts`: добавляет класс, ждёт `transitionend`, respect `AbortSignal`;
- `resetViewRootPresentation.test.ts` (расширить): после cancel нет active animations.

**Плюсы:** быстро, детерминированно, fake timers.

### Уровень B — Integration с registry (второй приоритет)

**Где:** новый файл, напр. `transition-hooks.integration.test.ts`.

**Отличие от текущих:** **без** mock `runPhaseHooks`; реальный hook + spy на side effects (classList, animate mock).

**Проверяет:** wiring engine → registry → DOM, не только pipeline phases.

### Уровень C — E2E demo (третий приоритет)

**Где:** `examples/demo` + browser job.

Smoke: navigation с transition attr, нет console errors, финальный view visible.

---

## Чеклист реализации

- [ ] **Reference hooks** — минимум `fade` (CSS) и/или `fade-wa` (Web Animations) в demo или test helpers
- [ ] **Unit:** hook ждёт end event; abort/cancel сбрасывает presentation
- [ ] **Integration:** один E2E navigation с живым registry (без mock `runPhaseHooks`)
- [ ] **Integration:** parallel — анимация на обоих view roots одновременно (2 `animate()` / 2 класса)
- [ ] **Integration:** supersede mid-animation → `revertInFlightView` / cleanup
- [ ] **Док:** обновить [IN_PLACE_REMOUNT.md](./IN_PLACE_REMOUNT.md) § transition — ссылка на этот doc для animation layer
- [ ] **VT:** при реализации [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md) — отдельный test plan, не смешивать с hook-based CSS/GSAP

---

## Связь с событиями (future)

[NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) предлагает `transition-in:end` / `transition-out:end` для GSAP/VT. Тесты animation layer должны использовать те же semantic boundaries, что и future DOM events (hook complete ≡ event fire).

---

## Явно out of scope для engine integration suite

| Не делать в `*-transition.integration.test.ts` | Почему |
|------------------------------------------------|--------|
| Проверять конкретный easing / duration | App concern |
| Screenshot / pixel diff | E2E, flaky |
| Требовать GSAP в devDependencies core | Optional peer / demo only |
| Дублировать все сценарии IN_PLACE_REMOUNT с «настоящим fade» | Достаточно одного smoke на уровне B |

---

## Ссылки на код

| Компонент | Путь |
|-----------|------|
| Transition pipeline | `aura-routing-engine/core/navigation/navigation-transaction-pipeline.ts` → `runRenderWithTransition` |
| Phase registry | `aura-routing-engine/core/lifecycle/phase-registry.ts` → `transitionOut`, `transitionIn` |
| Hook runner | `aura-routing-engine/core/hooks/registry.ts` → `runPhaseHooks` |
| Staged mount flag | `aura-route/core/view/render-pass.ts` → `useStagedMount` |
| Presentation reset | `aura-route/core/view/view-controller.ts` → `resetViewRootPresentation` |
| Текущие integration-тесты | `aura-routing-engine/test/navigation/*transition*.integration.test.ts` |

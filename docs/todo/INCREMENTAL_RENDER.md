# Инкрементальный render: аналог `requestUpdate()` + template diff

> **Статус документа:** актуально на 2026-06-18  
> План перехода от «полной замены DOM в `AURARoute.render()`» к инкрементальному обновлению, сопоставимому по hot path с Lit Router.  
> Контекст perf — [ARCHITECTURE_BENCHMARK.md](./ARCHITECTURE_BENCHMARK.md). Renderer в целевой модели — [FUTURE_PROOF_ENGINE.md §4](./FUTURE_PROOF_ENGINE.md).

---

## TL;DR

| | Lit Router | aura-ui-router (сейчас) | Цель |
|---|------------|---------------------------|------|
| Триггер UI | `requestUpdate()` | `coordinator.run()` → `renderRoute()` | Coordinator остаётся; commit делегирует Renderer |
| Обновление DOM | **lit-html diff** (движок Lit) | fetch + `innerHTML` / loader | **patch / reuse nodes**, не full replace |
| Старый контент | diff заменяет узлы | `onLeft` + очистка DOM | `dispose(handle)` на ViewHandle |

**Template diff — не API браузера**, а алгоритм `lit-html`. Aura не обязана копировать Lit: достаточно **Renderer abstraction** + стратегии incremental update.

---

## Зачем это нужно

На trivial navigation Lit быстрее largely потому что:

1. **`requestUpdate()`** — один batched update cycle вместо 8+ async-фаз pipeline (когда hooks пустые — см. fast path).
2. **Template diff** — меняются только отличия в DOM, а не весь fragment через `innerHTML`.

Aura-ui-router **не теряет** транзакционную модель (guards, load, commit point, stale/abort). Меняется только **слой commit** — как именно DOM обновляется после успешного prepare.

---

## Принципы (не ломать архитектуру)

1. **NavigationCoordinator** по-прежнему владеет prepare → commit → post.
2. **Commit point** — единственное место, где Renderer меняет видимый UI целевого outlet.
3. **`AURARoute`** — view-адаптер: phase attrs, loaders, outlet; не orchestrator.
4. **Lit — опциональный backend**, не hard dependency пакета (vanilla WC first).
5. **Fast path** — если нет blocking hooks/load, пропускать лишние фазы. **Реализовано:** [IMPLEMENTATION_STEPS.md §5b](./IMPLEMENTATION_STEPS.md#фаза-5b--fast-path--span-stylecolor-2ea043-font-weight-boldspan-готово) (`NavigationTransaction`, не coordinator).

---

## Обзор этапов

| # | Что | Зависимости | Меняет поведение? |
|---|-----|-------------|-------------------|
| **R0** | Baseline + метрики | — | нет |
| **R1** | `Renderer` interface + `ViewHandle` | этап 6 IMPLEMENTATION_STEPS (частично) | нет (рефакторинг) |
| **R2** | Route capabilities + navigation fast path | R1 | да (perf) — **частично ✓** |
| **R3** | `IncrementalDomRenderer` (reuse / morph) | R1 | да (DOM) |
| **R4** | Опциональный `LitRenderer` adapter | R1, peer `@lit/reactive-element` | да (opt-in) |
| **R5** | Nested outlet + partial patch | этап 6 tree diff | да |
| **R6** | Post-commit effects без блокировки commit | R2 | да (perf) |

```text
R0 metrics  →  R1 Renderer API  →  R2 fast path
                      ↓
              R3 Incremental DOM  /  R4 Lit adapter (opt-in)
                      ↓
              R5 nested partial patch  →  R6 defer effects
```

---

## R0 — Baseline и метрики

### Зачем

Измерить, где теряется время, до оптимизаций.

### Что сделать

1. Dev-only тайминги в coordinator: `prepare`, `commit`, `post` (см. EventBus в [FUTURE_PROOF_ENGINE.md §5](./FUTURE_PROOF_ENGINE.md)).
2. Сценарии бенчмарка:
   - trivial A→B, без hooks, `source="html"`;
   - A→B с `html-src` (fetch);
   - reenter;
   - быстрые A→B→C (abort).
3. Зафиксировать: кол-во `innerHTML`, размер DOM subtree, число microtasks на navigation.

### Критерий готовности

- Таблица baseline в issue / PR description (не обязательно в CI).

---

## R1 — Renderer abstraction

### Зачем

Отделить **«что коммитить»** (coordinator) от **«как рисовать»** (Renderer). См. [ENGINE_OBJECT_MODEL.md](./ENGINE_OBJECT_MODEL.md), [FUTURE_PROOF_ENGINE.md §4](./FUTURE_PROOF_ENGINE.md), [todo/RENDERER_ABSTRACTION.md](./todo/RENDERER_ABSTRACTION.md).

### Что сделать

1. Новый модуль `aura-router/core/renderer/` (или `aura-render/`):

```ts
/** Handle на отрисованный view — для teardown в left/dispose */
export interface ViewHandle {
  dispose(): void;
}

export interface RenderContext {
  route: AURARoute;
  match: RouteMatch;
  signal: AbortSignal;
  /** Уже загруженный payload из load phase (если есть) */
  data?: unknown;
}

export interface RouteRenderer {
  commit(ctx: RenderContext, outlet: Element): Promise<ViewHandle>;
}
```

2. **`DomReplaceRenderer`** — текущее поведение (`AURARoute.render()` + loaders) как default implementation.
3. **`AuraRouter.renderRoute()`** — делегирует в `RouteRenderer.commit()`, сохраняет `ViewHandle` для post-commit `left`.
4. Coordinator deps: `renderRoute` → `renderer.commit(...)`.

### Файлы

| Файл | Изменения |
|------|-----------|
| `aura-router/core/renderer/types.ts` | `ViewHandle`, `RouteRenderer`, `RenderContext` |
| `aura-router/core/renderer/dom-replace-renderer.ts` | wrap текущего `render()` |
| `aura-router/core/aura-router.ts` | wiring, хранение active handles per route |

### Критерий готовности

- Поведение идентично текущему (full replace).
- `onLeft` / teardown вызывает `viewHandle.dispose()` вместо прямого `textContent = ''`.

---

## R2 — Route capabilities + fast path

> **Частично реализовано:** [IMPLEMENTATION_STEPS.md §5b](./IMPLEMENTATION_STEPS.md#фаза-5b--fast-path--span-stylecolor-2ea043-font-weight-boldspan-готово).  
> Fast path живёт в **`NavigationTransaction`** (`canUseFastPath()` + `runFastPipeline()`), не в coordinator.

### Зачем

Не гонять полный pipeline, когда hooks/load/effects не нужны — parity с Lit на trivial cases.

### Что сделать

1. При `connectedCallback` / `collectRoutes` вычислить **bitmask** на route:

```ts
type RouteCapabilities = {
  hasLeave: boolean;
  hasEnter: boolean;
  hasLoad: boolean;
  hasTransitionIn: boolean;
  hasPostEffects: boolean; // transition-out | left | entered | reenter
};
```

2. **`NavigationTransaction.runFastPipeline()`** (ветка в `run()`):

```text
if (plan.isSimple && !fromRoute?.capabilities.hasLeave && !toRoute.capabilities.hasEnter
    && !toRoute.capabilities.hasLoad && !toRoute.capabilities.hasTransitionIn
    && !toRoute.capabilities.hasPostEffects)
  → begin(job) → renderer.commit() → return
```

3. **`reenter`** с пустым `reenter` attr — skip hooks, только `rebindLinks` (если нужно).

4. Убрать dev `console.log` из phase callbacks в production ([ROADMAP.md фаза 0](./ROADMAP.md)).

### Критерий готовности

- Trivial navigation: ≤ 2 microtasks до commit (измерено в R0).
- Маршрут с `enter="auth"` — полный pipeline без изменений.

---

## R3 — IncrementalDomRenderer (без Lit)

### Зачем

Получить эффект «template diff» для vanilla WC **без** привязки к Lit: меньше work на DOM при повторных визитах и похожих фрагментах.

### Стратегии (выбрать одну или несколько)

| Стратегия | Когда | Плюсы / минусы |
|-----------|-------|----------------|
| **Node reuse** | тот же route, тот же template | cache `DocumentFragment` по route key; swap children |
| **morphdom** (opt-in dep) | HTML string из loader | diff двух subtree; знакомый паттерн |
| **Keyed outlets** | nested (R5) | patch только leaf outlet |
| **Preserve static shell** | `source="html"` с stable wrapper | менять только `[data-route-content]` |

### Что сделать

1. `IncrementalDomRenderer implements RouteRenderer`:
   - если `keepAlive` / cache hit → patch, не `innerHTML` whole route;
   - иначе fallback → `DomReplaceRenderer`.
2. Content loaders возвращают `{ html, version? }` для cache key.
3. **`dispose()`** — снимает listeners, abort loader, **не** обязательно уничтожает весь subtree если reuse.

### Критерий готовности

- Повторный визит `/users` без invalidation — нет full `innerHTML` (assert в test).
- Первый визит — поведение как сейчас.

---

## R4 — Lit adapter (опционально): `requestUpdate()` + template diff

### Зачем

Приложения на Lit получают **нативный** lit-html diff через стандартный reactive cycle — без дублирования алгоритма в aura.

### Важно

- **`@lit/reactive-element`** — optional peer dependency.
- Vanilla-пользователи **не** тянут Lit в bundle.

### Что сделать

1. Пакет или subpath: `aura-ui-router/lit` (или `@aura/router-lit`).

2. **`LitRouteRenderer implements RouteRenderer`**:

```ts
// Концепция — не текущий API
class LitRouteHost extends LitElement {
  @state() private outlet: unknown;

  render() {
    return this.outlet ?? nothing;
  }

  setOutlet(template: TemplateResult) {
    this.outlet = template;
    this.requestUpdate(); // ← batched update
  }
}
```

3. Маршрут Lit-приложения регистрирует **render callback**:

```ts
// Lit app
{ pattern: '/users', render: (params) => html`<user-list .params=${params}>` }
```

4. На commit coordinator → `litRenderer.commit()`:
   - resolve template (sync или после load data);
   - `host.setOutlet(template)` → **lit-html diff** внутри update;
   - `ViewHandle.dispose()` → `host.setOutlet(nothing)`.

5. **`AURARoute`** для Lit-mode: thin wrapper или `<aura-route lit-render="...">` делегирует в host outlet.

### Связь с Lit Router

| Lit Router | Aura + LitRouteRenderer |
|------------|-------------------------|
| `Routes.goto()` → state → `requestUpdate()` | `coordinator.run()` → prepare → `commit()` → `requestUpdate()` |
| только `enter()` guard | полный lifecycle + optional fast path |
| нет stale job | NavigationJob + attempt/tx ids |

### Критерий готовности

- Demo: Lit app + aura-router, trivial nav быстрее full pipeline (fast path + Lit diff).
- Bundle: core без Lit; lit adapter tree-shakeable.

---

## R5 — Nested outlet + partial patch

### Зачем

После [NESTED_ROUTES.md](./NESTED_ROUTES.md) layout **не перерисовывается** — patch только leaf outlet. Это главное преимущество над Lit Router на dashboard-приложениях.

### Что сделать

1. `TransitionPlan` → несколько activate nodes; commit только **changed** outlets.
2. Renderer получает `{ node, outletElement, data }[]` — patch per outlet.
3. LCA nodes: **reuse** ViewHandle, skip `dispose`.
4. Leaf swap: `IncrementalDomRenderer` или `LitRouteRenderer` только на leaf.

### Критерий готовности

- `/app/a` → `/app/b`: layout DOM stable (same node references in test).
- См. этап 6 в [IMPLEMENTATION_STEPS.md](./IMPLEMENTATION_STEPS.md).

---

## R6 — Post-commit effects без блокировки

### Зачем

`transition-in`, `transition-out`, `left`, `entered` без hooks не должны `await`-блокировать return из commit.

### Что сделать

1. Если `!capabilities.hasPostEffects` для route — skip post phases entirely.
2. Если hooks есть, но non-blocking — `queueMicrotask` / `requestAnimationFrame` для effects после commit return.
3. Coordinator: `await render` → sync return navigation ok → effects in background (с `isStale` guard).

### Критерий готовности

- Time-to-first-paint после commit не ждёт пустые `onTransitionOut` / `onEntered`.

---

## Чеклист

### R0
- [ ] Dev timings prepare/commit/post
- [ ] Baseline scenarios documented

### R1
- [ ] `RouteRenderer` + `ViewHandle`
- [ ] `DomReplaceRenderer` (default)
- [ ] `renderRoute` delegates to renderer

### R2
- [x] Route capabilities bitmask
- [x] Processor fast path (`canUseFastPath` + `runFastPipeline`)
- [ ] Production: no console.log in phase callbacks

### R3
- [ ] `IncrementalDomRenderer` + cache/morph strategy
- [ ] Test: no full innerHTML on revisit

### R4
- [ ] Optional `LitRouteRenderer` + peer dep
- [ ] Demo app

### R5
- [ ] Partial outlet patch with nested tree
- [ ] LCA reuse ViewHandle

### R6
- [ ] Defer non-blocking post-commit phases

---

## FAQ

### Нужно ли внедрять Lit в core?

**Нет.** Core остаётся framework-agnostic. Lit — optional renderer backend (R4).

### Это заменит content loaders?

**Нет.** Loaders готовят data **до commit**; Renderer решает, **как** data попадает в DOM (replace vs patch vs Lit template).

### Fast path не сломает guards?

Fast path активируется только когда bitmask = 0 и plan simple. Любой hook attr → full pipeline.

### Template diff появится в браузере?

Пока **нет** стандартного API. Браузер даёт DOM primitives; diff — Lit, Vue, React или morphdom / custom patch в Renderer.

---

## Связанные документы

- [ARCHITECTURE_BENCHMARK.md](./ARCHITECTURE_BENCHMARK.md) — сравнение с Lit Router, perf gaps
- [IMPLEMENTATION_STEPS.md](./IMPLEMENTATION_STEPS.md) — этап 6 (Nested + DataGraph + Renderer)
- [FUTURE_PROOF_ENGINE.md](./FUTURE_PROOF_ENGINE.md) — Renderer abstraction, EventBus
- [NESTED_ROUTES.md](./NESTED_ROUTES.md) — outlet model для R5
- [COMPETITORS.md](./COMPETITORS.md) — Lit Router positioning

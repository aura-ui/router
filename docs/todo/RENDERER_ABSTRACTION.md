# Engine-level Renderer — `renderNode()` и централизованный `dispose`

> **Статус:** <span style="color: #bf8700; font-weight: bold;">~</span> частично · **фаза 6**  
> **Последнее обновление:** 2026-06-30  
> **Связанные документы:** [FUTURE_PROOF_ENGINE.md §4](../FUTURE_PROOF_ENGINE.md), [IMPLEMENTATION_STEPS.md §фаза 6](../IMPLEMENTATION_STEPS.md), [ENGINE_OBJECT_MODEL.md §3](../ENGINE_OBJECT_MODEL.md), [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md), [DATAGRAPH.md](./DATAGRAPH.md)

---

## TL;DR

| | Сейчас | Цель |
|---|--------|------|
| Монтирование view | `AuraRoute.render()` → `RouteViewController` → `outlet.apply()` | `Renderer.renderNode(nodeId, ctx)` в engine |
| Teardown | `AuraRoute.onLeft()` → `viewController.onLeft()` — каждый route сам | Engine вызывает `dispose(handle)` на `exitRoutes` из `TransitionPlan` |
| Handle | `ViewHandle` в `aura-outlet` (`destroy` / `detach`) | Тот же контракт, но владелец lifecycle — coordinator / processor |
| Привязка к DOM | Render и ContentLoader внутри `<aura-route>` | Renderer — сменяемый слой (DOM, shadow, islands, canvas) |

**Почему «~ частично»:** абстракция **ViewHandle** и **RouteViewController v1** уже есть на view-слое, но **engine-level `Renderer.renderNode()`** отсутствует — render/teardown по-прежнему живут в `AuraRoute`, а не в отдельном слое engine.

---

## Зачем

- **Nested routes** — engine знает `activate[]` / `deactivate[]` из `TransitionPlan` и единообразно render/dispose по дереву.
- **Не только DOM** — partial HTML, islands/partial hydration, shadow DOM, canvas/webgl через смену реализации Renderer без правок pipeline.
- **View Transitions API (фаза 7)** — commit point оборачивает один вызов `Renderer.commit()`, а не N вызовов `route.render()`.
- **DataGraph (фаза 6)** — coordinator сначала строит `Map<nodeId, data>`, потом Renderer материализует view по spec + data.

---

## Что уже есть

| Компонент | Где | Что даёт |
|-----------|-----|----------|
| **`ViewHandle`** | `aura-outlet/core/aura-outlet.ts` | `viewRoot`, `destroy()`, `detach()`, `findChildOutlet()` |
| **`RouteViewController` v1** | `aura-route/core/view/view-controller.ts` | Staged/active handles, `commitStagedView()`, keep-alive |
| **`outlet.ts`** | `aura-route/core/view/outlet.ts` | `mountContent()` → handle; `unmountHandle()` → destroy/detach |
| **Staged commit** | `NavigationTransactionPipeline.runAfterRender()` | DOM promote до commit gate — готово к обёртке VT |

View-слой (outlet + handles) — **фундамент** для engine Renderer. Не нужно переписывать с нуля.

### Ключевые файлы (as-is)

| Компонент | Путь |
|-----------|------|
| `ViewHandle`, `AuraOutlet.apply()` | `src/modules/aura-outlet/core/aura-outlet.ts` |
| Mount / unmount policy | `src/modules/aura-route/core/view/outlet.ts` |
| Render orchestration | `src/modules/aura-route/core/view/view-controller.ts` |
| Public render entry | `src/modules/aura-route/core/aura-route.ts` — `render()`, `onLeft()` |
| Transition plan | `src/modules/aura-routing-engine/core/route-tree/` |

---

## Чего не хватает

| Цель | Сейчас |
|------|--------|
| **`Renderer.renderNode(nodeId, ctx)`** | Нет в `aura-routing-engine` |
| **Централизованный `dispose`** | `left` → `route.onLeft()` — route сам решает teardown |
| **Engine не привязан к DOM** | Render = `AuraRoute.render()` + `ContentLoaderRegistry` внутри WC |
| **Coordinator → Renderer** | Pipeline вызывает `route.render()` напрямую, не через Renderer |

---

## Целевой контракт

```ts
type ViewHandle = {
  dispose: () => void;
  // as-is в aura-outlet: viewRoot, detach, findChildOutlet — расширить или адаптировать
};

type RenderContext = {
  nodeId: string;
  container: Element; // outlet element
  data: unknown;      // из DataGraph Map<nodeId, data>
  signal: AbortSignal;
  viewSpec: unknown;  // view attr / content loader spec
};

type Renderer = {
  renderNode(ctx: RenderContext): Promise<ViewHandle>;
  dispose(handle: ViewHandle): void;
};

const domRenderer: Renderer = {
  async renderNode(ctx) {
    // ContentLoaderRegistry → outlet.apply → ViewHandle
    return handle;
  },
  dispose(handle) {
    handle.dispose();
  },
};
```

**Правило:** `left` и смена маршрута вызывают `dispose` на деактивируемых узлах из `TransitionPlan.exitRoutes`, а не «route угадывает» teardown в `onLeft()`.

---

## План внедрения (R0–R4)

### R0 — Интерфейс и размещение

- [ ] `Renderer` interface в `aura-routing-engine` (например `core/renderer/`).
- [ ] `DomRenderer` — thin adapter поверх существующих `RouteViewController` + `ContentLoaderRegistry`.
- [ ] DI: processor/coordinator получает `renderer` (default = `DomRenderer`).

### R1 — Render по TransitionPlan

- [ ] `runRenderWithTransition` / `runViewCommit` вызывает `renderer.renderNode()` для `enterRoutes`, не `route.render()` напрямую.
- [ ] `AuraRoute.render()` остаётся как **делегат** / deprecated path до полного cutover.
- [ ] Сохранить staged commit: Renderer возвращает handle до `commitStagedView()`.

### R2 — Централизованный dispose

- [ ] На `exitRoutes` / фазе `left`: engine вызывает `renderer.dispose(handle)` по registry `Map<nodeId, ViewHandle>`.
- [ ] `AuraRoute.onLeft()` — только route-local cleanup (hooks, attrs), не DOM teardown.
- [ ] Fast path (`runFastPipeline`) — тот же контракт dispose.

### R3 — Связка с DataGraph

- [ ] `RenderContext.data` из `Map<nodeId, data>` coordinator (блокирует полный cutover до DataGraph).
- [ ] Content loaders получают data из ctx, не из ad-hoc store в route.

### R4 — Альтернативные targets (опционально, 6b)

- [ ] Второй Renderer (Lit adapter / incremental DOM) — см. [INCREMENTAL_RENDER.md](../INCREMENTAL_RENDER.md).
- [ ] Shadow DOM / slot policy — через `container` в `RenderContext`.

---

## Зависимости

```text
Route tree + TransitionPlan (фаза 5)     ✓
ViewHandle + RouteViewController (view)   ✓
Commit point + staged render (фаза 4)     ✓
DataGraph coordinator (фаза 6)            ✗  — R3; можно R0–R2 без полного graph
View Transitions API wrapper (фаза 7)     ✗  — после R1 (единый commit)
```

**Следующий фокус:** R0 + R1 параллельно с DataGraph; R2 — сразу после R1 (иначе двойной teardown route + engine).

---

## Мнемоника

```text
Сейчас:  AuraRoute.render() + outlet ViewHandle  →  view-слой готов
Цель:    Coordinator → Renderer.renderNode()     →  engine владеет lifecycle

ContentLoaderRegistry  =  HOW (материализация view spec → DOM)
Renderer               =  WHO/WHERE (какой node, в какой outlet, когда dispose)
DataGraph              =  WHAT (данные до render, per node)
```

---

## Чеклист сверки (для закрытия «~» → «✓»)

- [ ] `Renderer` interface + `DomRenderer` в engine
- [ ] `renderNode` вызывается из processor для `enterRoutes`
- [ ] `dispose` вызывается из processor для `exitRoutes` (не только `route.onLeft`)
- [ ] Registry handles `Map<nodeId, ViewHandle>` в engine или coordinator
- [ ] Тесты: nested deactivate parent keeps child layout; flat swap dispose; staged commit + dispose outgoing
- [ ] [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md) §4 и [IMPLEMENTATION_STEPS.md](../IMPLEMENTATION_STEPS.md) фаза 6 — обновить статус

---

## См. также

- [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) — решения по outlet/layout (часть уже в коде)
- [VIEW_LAYER_ARCHITECTURE.md](./VIEW_LAYER_ARCHITECTURE.md) — поток view-слоя, v1/v2
- [DATAGRAPH.md](./DATAGRAPH.md) — data layer до render
- [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md) — обёртка поверх commit (фаза 7)

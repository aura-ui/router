# TODO: nested outlet + render-слой (без aura-route-view)

> **Статус:** план / архитектура (не реализовано)  
> **Связь:** [P0-1](../comparison/FEATURE_PARITY_ROADMAP.md) · [NESTED_ROUTES.md](../NESTED_ROUTES.md) · [INCREMENTAL_RENDER.md](../INCREMENTAL_RENDER.md)  
> **Контекст:** итог архитектурного обсуждения (2026-06); engine (LCA, `enterRoutes`) уже готов — не хватает view-слоя.

---

## Решения (TL;DR)

| Решение | Выбор |
|---------|--------|
| Контент в `<aura-route>` (`innerHTML`) | **Нет** — не масштабируется на nested + patch |
| Отдельный CE `aura-route-view` | **Нет** — достаточно `<aura-outlet>` + programmatic `ViewHandle` |
| Mount point | **`<aura-outlet>`** — единственный слот для visible UI |
| `<aura-route>` | metadata + lifecycle; `render()` делегирует renderer |
| Два режима render | **`layout`** (parent с `layout` attr) · **`content`** (leaf / flat) |
| DOM-мутации | **`outlet.apply(next, { strategy })`** — replace / patch / stage |
| Strategy кто выбирает | **сверху** (RouteRenderer / capabilities), outlet — **исполнитель** |
| Анимация | hooks на route, DOM на **`ViewHandle.root`** (wrapper в outlet) |
| Данные vs разметка | [DATAGRAPH.md](./DATAGRAPH.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md) |

---

## Почему не рисовать в `<aura-route>`

Flat v0.1 (`setContent(this)`) работал для анимаций и простоты, но для nested и P0-5 (patch):

- child `<aura-route>` в DOM — **metadata**, контент должен жить в **outlet родителя**;
- `onLeft` чистит `route.textContent`, а view в outlet — **рассинхрон**;
- patch и `keep-alive` нужен явный **handle на subtree**, не CE маршрута.

**Логика остаётся в `AURARoute.render()`** — меняется только target: не `this`, а `getMountOutlet()`.

---

## Компоненты

```text
<aura-router>
  <aura-outlet />                    <!-- root slot -->

  <aura-route path="/settings" layout="main-layout">
    <aura-route path="profile" source="html-src" … />
  </aura-route>
</aura-router>

<template id="main-layout">
  <header>…</header>
  <aura-outlet />                    <!-- nested slot для children -->
</template>
```

| Сущность | Роль |
|----------|------|
| **`<aura-route>`** | path, hooks, `layout`, loaders attrs; hidden; не view host |
| **`<aura-outlet>`** | DOM-слот; принимает children от renderer |
| **`RouteNode.childOutlet`** | ссылка на nested `<aura-outlet>` после layout render |
| **`ViewHandle`** | `{ root, outlet, dispose, detach, patch? }` — programmatic, не CE |
| **`RouteRenderer`** | `commit(ctx, outlet) → ViewHandle` |
| **`RouteViewController`** | resolve outlet/mode, wiring route ↔ renderer (не CE) |

---

## Два режима render

Выбор на каждом узле из `plan.enterRoutes`:

```typescript
type RouteMountType = route.layout ? 'layout' : 'content';
```

### A. `layout` (parent с `layout="…"`)

```text
outlet = parent.childOutlet ?? router.rootOutlet
handle = renderer.commitLayout(outlet, template)
node.childOutlet = handle.findNestedOutlet()   // <aura-outlet> внутри layout
node.activeHandle = handle
```

Layout = shell (header, nav). Контент child — **не** на этом шаге.

### B. `content` (leaf или flat без layout)

```text
outlet = parent.childOutlet ?? router.rootOutlet
handle = renderer.commitContent(outlet, payload)   // loaders / DataCache
node.activeHandle = handle
```

Опционально: parent с `source` без `layout` — контент + поиск `<aura-outlet>` внутри loaded HTML ([NESTED_ROUTES.md](../NESTED_ROUTES.md) open question → default: да).

---

## Pipeline + render (engine не меняем)

```text
for (matchedRoute of plan.enterRoutes) {
  await route.render(matchedRoute)   // → RouteViewController → renderer → outlet
}
```

**Teardown (`onLeft`):**

```text
transition-out(handle.root) → handle.dispose() | handle.detach()  // keep-alive
if (layout) node.childOutlet = null
node.activeHandle = null
```

---

## Outlet как исполнитель DOM

Сверху передаётся **strategy**, outlet не решает сам:

```typescript
type OutletStrategy = 'replace' | 'patch' | 'stage';

outlet.apply(next: Node | string, opts: {
  strategy: OutletStrategy;
  key?: string;
  signal?: AbortSignal;
}): ViewHandle;
```

| Strategy | Когда (решает renderer) | Действие outlet |
|----------|-------------------------|-----------------|
| **replace** | новый route, cold enter, нет анимации | снять старое, вставить новое |
| **patch** | тот же key, Tier 0, P0-5 | diff / reuse узлов |
| **stage** | `transition-out/in`, policy parallel | временно 2 слоя, crossfade |

Прямой `innerHTML` на outlet — не поддерживаемый путь (dev-warning).

Renderer facade:

```text
RouteRenderer
├── ReplaceRenderer      // v1 default
├── PatchRenderer        // P0-5
└── StagingRenderer      // обёртка для анимации
```

---

## Анимация

- Hooks (`transition-out` / `transition-in`) — на **route** (attrs).
- DOM-эффект — на **`ViewHandle.root`** (часто `div.aura-view` в outlet).
- **Layout** при sibling switch **не в** `exitRoutes` / `enterRoutes` → не анимируется, стабилен.
- **Patch vs анимация** — не взаимоисключающие: при анимации `stage`, после — снова один handle → patch возможен.

| Policy | Порядок |
|--------|---------|
| **out-in** | animateOut → dispose → commit → animateIn |
| **out-in-prefetch** | animateOut ‖ render (hidden) → reveal → animateIn → dispose old — см. [OUT_IN_PREFETCH.md](./OUT_IN_PREFETCH.md) |
| **in-out** | commit (staging) → animateIn + animateOut → dispose old |
| **parallel** | оба view в outlet → crossfade → dispose old |

---

## Сценарии (сводка)

Дерево: `/settings` (layout) → `profile`, `security`; flat `/`, `/about`.

| Переход | enterRoutes | Render |
|---------|-------------|--------|
| `/` → `/about` | `[about]` | content → rootOutlet |
| `/` → `/settings/profile` | `[settings, profile]` | layout → root; content → nested outlet |
| `profile` → `security` | `[security]` | только content в settings.outlet; layout reuse |
| `profile` → `/` | exit profile, settings; enter home | dispose chain; content home → rootOutlet |
| reenter same URL | `[leaf]`, `reenter: true` | skip render или patch / reattach |

---

## Связь с другими слоями

```text
runGuards (leave, enter)
  → DataGraph.load(enterRoutes)          // DATAGRAPH.md
  → render:
       content ← DataCache / loaders  // CONTENT_CACHE.md
       outlet.apply(…, strategy)
  → left / entered
```

- **Prefetch:** data + content параллельно на intent; guards не вызываем.
- **P0-2 Tier 0:** нет hooks/transitions → `replace` или `patch` без полного pipeline.
- **P0-5:** patch только leaf outlet; layout DOM stable.

---

## Модули (черновик)

```text
src/modules/
├── aura-route/              render() → controller, не innerHTML
├── aura-outlet/               CE-слот, apply(), find nested
├── aura-route-render/         RouteRenderer, ViewHandle, strategies
│   └── route-view-controller.ts
├── aura-routing-engine/       без DOM (plan, pipeline как есть)
├── aura-content-loaders/      + DataCache → CONTENT_CACHE.md
└── aura-routing-engine/
    └── data-graph/            → DATAGRAPH.md
```

Расширить или заменить `aura-router-outlet` (сейчас только 404 fallback) — решить при реализации P0-1.

---

## Порядок реализации

```text
1. ViewHandle + ReplaceRenderer + root outlet (flat)
2. layout mode + nested <aura-outlet> + childOutlet (P0-1)
3. TransitionRunner + StagingRenderer (анимация на handle.root)
4. PatchRenderer на content outlet (P0-5, после P0-1)
5. Tier 0 fast path (P0-2)
```

---

## Критерии готовности (P0-1 + render)

- [ ] `<aura-route>` не пишет view в `this.innerHTML`
- [ ] Root + nested `<aura-outlet>`
- [ ] `layout` → shell + `childOutlet`
- [ ] `content` → mount в parent outlet
- [ ] Sibling switch: layout stable, только leaf меняется
- [ ] `onLeft` → `handle.dispose()` / `detach()`
- [ ] `outlet.apply(strategy)` — replace / patch / stage
- [ ] Анимация на `handle.root`

---

## Open questions

1. **Root outlet** — явный в `<aura-router>` или auto-create при init?
2. **Parent `source` без `layout`** — outlet внутри loaded HTML (default: да).
3. **Scoped 404** — layout + 404 в nested outlet ([NESTED_ROUTES.md](../NESTED_ROUTES.md)).
4. **`aura-router-outlet`** — merge с `aura-outlet` или два CE?
5. **Где хранить `activeHandle`** — `RouteNode` vs `AuraOutlet`.

---

## Связанные документы

- [NESTED_ROUTES.md](../NESTED_ROUTES.md) — целевой HTML API
- [INCREMENTAL_RENDER.md](../INCREMENTAL_RENDER.md) — R1, R5, ViewHandle
- [FEATURE_PARITY_ROADMAP.md §P0-1, P0-5](../comparison/FEATURE_PARITY_ROADMAP.md)
- [DATAGRAPH.md](./DATAGRAPH.md)
- [CONTENT_CACHE.md](./CONTENT_CACHE.md)

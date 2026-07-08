# TODO: nested outlet + render-слой (без aura-route-view)

> **Статус:** <span style="color: #2ea043; font-weight: bold;">✓</span> **основной view-слой shipped** (2026-07) · <span style="color: #bf8700; font-weight: bold;">~</span> patch на navigation + полная анимация — в работе  
> **Связь:** [P0-1](../comparison/FEATURE_PARITY_ROADMAP.md) · [NESTED_ROUTES.md](../NESTED_ROUTES.md) · [INCREMENTAL_RENDER.md](../INCREMENTAL_RENDER.md)  
> **Контекст:** итог архитектурного обсуждения (2026-06); engine (LCA, `enterRoutes`) + view-слой (`aura-outlet`, `RouteViewController`) — в коде.

**Легенда:** <span style="color: #2ea043; font-weight: bold;">✓</span> сделано · <span style="color: #bf8700; font-weight: bold;">~</span> частично · <span style="color: #cf222e; font-weight: bold;">✗</span> не сделано

---

## Решения (TL;DR)

| Решение | Выбор | Статус |
|---------|--------|--------|
| Контент в `<aura-route>` (`innerHTML`) | **Нет** — не масштабируется на nested + patch | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| Отдельный CE `aura-route-view` | **Нет** — достаточно `<aura-outlet>` + programmatic `ViewHandle` | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| Mount point | **`<aura-outlet>`** — единственный слот для visible UI | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| `<aura-route>` | metadata + lifecycle; `render()` делегирует renderer | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| Два режима render | **`layout`** (parent с `layout` attr) · **`content`** (leaf / flat) | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| DOM-мутации | **`outlet.apply(next, { strategy })`** — replace / patch / stage | <span style="color: #bf8700; font-weight: bold;">~</span> replace+stage в navigation; patch — только CE |
| Strategy кто выбирает | **сверху** (RouteRenderer / capabilities), outlet — **исполнитель** | <span style="color: #bf8700; font-weight: bold;">~</span> `outlet-adapter` / `RouteViewController`, не отдельный `RouteRenderer` |
| Анимация | hooks на route, DOM на **`ViewHandle.root`** (wrapper в outlet) | <span style="color: #bf8700; font-weight: bold;">~</span> stage + lifecycle hooks; VT CSS / prefetch-out-in — нет |
| Данные vs разметка | [DATAGRAPH.md](./DATAGRAPH.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md) | <span style="color: #2ea043; font-weight: bold;">✓</span> DataGraph + ContentLoadService |

---

## Почему не рисовать в `<aura-route>`

Flat v0.1 (`setContent(this)`) работал для анимаций и простоты, но для nested и P0-5 (patch):

- child `<aura-route>` в DOM — **metadata**, контент должен жить в **outlet родителя**; <span style="color: #2ea043; font-weight: bold;">✓</span>
- `onLeft` чистит `route.textContent`, а view в outlet — **рассинхрон**; <span style="color: #2ea043; font-weight: bold;">✓</span> исправлено — teardown через `ViewHandle`
- patch и `keep-alive` нужен явный **handle на subtree**, не CE маршрута; <span style="color: #2ea043; font-weight: bold;">✓</span> `ViewHandle` + `preserve.view`

**Логика остаётся в `AURARoute.render()`** — меняется только target: не `this`, а `getMountOutlet()`. <span style="color: #2ea043; font-weight: bold;">✓</span>

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

| Сущность | Роль | Статус |
|----------|------|--------|
| **`<aura-route>`** | path, hooks, `layout`, loaders attrs; hidden; не view host | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **`<aura-outlet>`** | DOM-слот; принимает children от renderer | <span style="color: #2ea043; font-weight: bold;">✓</span> `aura-outlet/core/aura-outlet.ts` |
| **`RouteNode.childOutlet`** | ссылка на nested `<aura-outlet>` после layout render | <span style="color: #bf8700; font-weight: bold;">~</span> → `RouteViewController.nestedOutlet` / `MountSnapshot.nestedOutlet` (не на `RouteNode`) |
| **`ViewHandle`** | `{ root, outlet, dispose, detach, patch? }` — programmatic, не CE | <span style="color: #2ea043; font-weight: bold;">✓</span> `viewRoot`, `destroy()`, `detach()`, `findChildOutlet()` |
| **`RouteRenderer`** | `commit(ctx, outlet) → ViewHandle` | <span style="color: #cf222e; font-weight: bold;">✗</span> отдельного модуля нет; логика в `outlet-adapter` + `view-render-pipeline` |
| **`RouteViewController`** | resolve outlet/mode, wiring route ↔ renderer (не CE) | <span style="color: #2ea043; font-weight: bold;">✓</span> `aura-route/core/view/view-controller.ts` |

---

## Два режима render

Выбор на каждом узле из `plan.enterRoutes`:

```typescript
type RouteMountType = route.layout ? 'layout' : 'content';
```

<span style="color: #2ea043; font-weight: bold;">✓</span> `viewKind: 'layout' | 'content'` в `RouteViewController.beginPass()`

### A. `layout` (parent с `layout="…"`)

```text
outlet = parent.childOutlet ?? router.rootOutlet
handle = renderer.commitLayout(outlet, template)
node.childOutlet = handle.findNestedOutlet()   // <aura-outlet> внутри layout
node.activeHandle = handle
```

<span style="color: #2ea043; font-weight: bold;">✓</span> layout resolve → `outlet.apply` → `nestedOutlet = handle.findChildOutlet()`

Layout = shell (header, nav). Контент child — **не** на этом шаге.

### B. `content` (leaf или flat без layout)

```text
outlet = parent.childOutlet ?? router.rootOutlet
handle = renderer.commitContent(outlet, payload)   // loaders / DataCache
node.activeHandle = handle
```

<span style="color: #2ea043; font-weight: bold;">✓</span> mount в `mountTarget.nestedOutlet(routeInfo) ?? appOutlet`

Опционально: parent с `source` без `layout` — контент + поиск `<aura-outlet>` внутри loaded HTML ([NESTED_ROUTES.md](../NESTED_ROUTES.md) open question → default: да).  
<span style="color: #bf8700; font-weight: bold;">~</span> `findChildOutlet()` работает на любом view root; явный сценарий parent `view` + nested outlet — edge case

---

## Pipeline + render (engine не меняем)

```text
for (matchedRoute of plan.enterRoutes) {
  await route.render(matchedRoute)   // → RouteViewController → renderer → outlet
}
```

<span style="color: #2ea043; font-weight: bold;">✓</span> `runViewCommit` / branch-mount → `RouteInstance.render()`

**Teardown (`onLeft`):**

```text
transition-out(handle.root) → handle.dispose() | handle.detach()  // keep-alive
if (layout) node.childOutlet = null
node.activeHandle = null
```

<span style="color: #2ea043; font-weight: bold;">✓</span> `ViewTeardownPipeline.onUnmount()` → `unmountOnLeave` / `finalizeLeave`

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

<span style="color: #2ea043; font-weight: bold;">✓</span> реализовано в `AuraOutlet.apply()`

| Strategy | Когда (решает renderer) | Действие outlet | Статус |
|----------|-------------------------|-----------------|--------|
| **replace** | новый route, cold enter, нет анимации | снять старое, вставить новое | <span style="color: #2ea043; font-weight: bold;">✓</span> default в navigation |
| **patch** | тот же key, Tier 0, P0-5 | diff / reuse узлов | <span style="color: #bf8700; font-weight: bold;">~</span> CE + тесты; **не** выбирается из `RouteViewController` |
| **stage** | `transition-out/in`, policy parallel | временно 2 слоя, crossfade | <span style="color: #2ea043; font-weight: bold;">✓</span> `useStagedMount` + `commitStage` / `cancelStage` |

Прямой `innerHTML` на outlet — не поддерживаемый путь (dev-warning). <span style="color: #2ea043; font-weight: bold;">✓</span>

Renderer facade:

```text
RouteRenderer
├── ReplaceRenderer      // v1 default
├── PatchRenderer        // P0-5
└── StagingRenderer      // обёртка для анимации
```

<span style="color: #cf222e; font-weight: bold;">✗</span> отдельные классы не выделены — поведение в `outlet-adapter` + `AuraOutlet`

---

## Анимация

- Hooks (`transition-out` / `transition-in`) — на **route** (attrs). <span style="color: #2ea043; font-weight: bold;">✓</span>
- DOM-эффект — на **`ViewHandle.root`** (часто `div.aura-view` в outlet). <span style="color: #2ea043; font-weight: bold;">✓</span> `[data-aura-view-root]`
- **Layout** при sibling switch **не в** `exitRoutes` / `enterRoutes` → не анимируется, стабилен. <span style="color: #2ea043; font-weight: bold;">✓</span> LCA + skip already mounted
- **Patch vs анимация** — не взаимоисключающие: при анимации `stage`, после — снова один handle → patch возможен. <span style="color: #bf8700; font-weight: bold;">~</span> stage ✓; patch в navigation ✗

| Policy | Порядок | Статус |
|--------|---------|--------|
| **out-in** | animateOut → dispose → commit → animateIn | <span style="color: #2ea043; font-weight: bold;">✓</span> pipeline |
| **out-in-prefetch** | animateOut ‖ render (hidden) → reveal → animateIn → dispose old — см. [OUT_IN_PREFETCH.md](./OUT_IN_PREFETCH.md) | <span style="color: #cf222e; font-weight: bold;">✗</span> |
| **in-out** | commit (staging) → animateIn + animateOut → dispose old | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| **parallel** | оба view в outlet → crossfade → dispose old | <span style="color: #2ea043; font-weight: bold;">✓</span> integration tests |

---

## Сценарии (сводка)

Дерево: `/settings` (layout) → `profile`, `security`; flat `/`, `/about`.

| Переход | enterRoutes | Render | Статус |
|---------|-------------|--------|--------|
| `/` → `/about` | `[about]` | content → rootOutlet | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| `/` → `/settings/profile` | `[settings, profile]` | layout → root; content → nested outlet | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| `profile` → `security` | `[security]` | только content в settings.outlet; layout reuse | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| `profile` → `/` | exit profile, settings; enter home | dispose chain; content home → rootOutlet | <span style="color: #2ea043; font-weight: bold;">✓</span> |
| reenter same URL | `[leaf]`, `reenter: true` | skip render или patch / reattach | <span style="color: #bf8700; font-weight: bold;">~</span> skip / keep-alive ✓; patch ✗ |

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

- **Prefetch:** data + content параллельно на intent; guards не вызываем. <span style="color: #2ea043; font-weight: bold;">✓</span>
- **P0-2 Tier 0:** нет hooks/transitions → `replace` или `patch` без полного pipeline. <span style="color: #bf8700; font-weight: bold;">~</span> Tier 0 ✓ (flat only); patch ✗
- **P0-5:** patch только leaf outlet; layout DOM stable. <span style="color: #bf8700; font-weight: bold;">~</span> layout stable ✓; navigation patch ✗

---

## Модули (черновик → as-is)

```text
src/modules/
├── aura-route/              render() → controller, не innerHTML     ✓
├── aura-outlet/               CE-слот, apply(), find nested          ✓
├── aura-route-render/         RouteRenderer, ViewHandle, strategies  ✗ (не создан)
│   └── route-view-controller.ts
├── aura-routing-engine/       без DOM (plan, pipeline как есть)       ✓
├── aura-content-loaders/      + DataCache → CONTENT_CACHE.md         ✓ (content/ + ContentLoadService)
└── aura-routing-engine/
    └── data-graph/            → DATAGRAPH.md                          ✓
```

Расширить или заменить `aura-router-outlet` (сейчас только 404 fallback) — решить при реализации P0-1.  
<span style="color: #2ea043; font-weight: bold;">✓</span> решено: единый `<aura-outlet>`; 404 через `AuraRouterNotFoundController` → `appOutlet`

---

## Порядок реализации

```text
1. ViewHandle + ReplaceRenderer + root outlet (flat)              ✓
2. layout mode + nested <aura-outlet> + childOutlet (P0-1)        ✓
3. TransitionRunner + StagingRenderer (анимация на handle.root)    ~  (stage + hooks; без TransitionRunner CE)
4. PatchRenderer на content outlet (P0-5, после P0-1)             ✗
5. Tier 0 fast path (P0-2)                                        ~  (✓ flat; ✗ nested)
```

---

## Критерии готовности (P0-1 + render)

- <span style="color: #2ea043; font-weight: bold;">✓</span> `<aura-route>` не пишет view в `this.innerHTML`
- <span style="color: #2ea043; font-weight: bold;">✓</span> Root + nested `<aura-outlet>`
- <span style="color: #2ea043; font-weight: bold;">✓</span> `layout` → shell + `childOutlet` (`nestedOutlet`)
- <span style="color: #2ea043; font-weight: bold;">✓</span> `content` → mount в parent outlet
- <span style="color: #2ea043; font-weight: bold;">✓</span> Sibling switch: layout stable, только leaf меняется
- <span style="color: #2ea043; font-weight: bold;">✓</span> `onLeft` → `handle.dispose()` / `detach()`
- <span style="color: #bf8700; font-weight: bold;">~</span> `outlet.apply(strategy)` — replace / patch / stage (patch не из navigation)
- <span style="color: #bf8700; font-weight: bold;">~</span> Анимация на `handle.root` (stage + lifecycle; VT / nested CSS — нет)

---

## Open questions

| # | Вопрос | Статус |
|---|--------|--------|
| 1 | **Root outlet** — явный в `<aura-router>` или auto-create при init? | <span style="color: #2ea043; font-weight: bold;">✓</span> **явный** — `appOutlet = querySelector('aura-outlet')`, иначе `NotFoundError` |
| 2 | **Parent `source` без `layout`** — outlet внутри loaded HTML (default: да). | <span style="color: #bf8700; font-weight: bold;">~</span> `findChildOutlet()` ✓; dedicated flow ✗ |
| 3 | **Scoped 404** — layout + 404 в nested outlet ([NESTED_ROUTES.md](../NESTED_ROUTES.md)). | <span style="color: #cf222e; font-weight: bold;">✗</span> fallback 404 только в root `appOutlet` |
| 4 | **`aura-router-outlet`** — merge с `aura-outlet` или два CE? | <span style="color: #2ea043; font-weight: bold;">✓</span> один CE `<aura-outlet>` |
| 5 | **Где хранить `activeHandle`** — `RouteNode` vs `AuraOutlet`. | <span style="color: #2ea043; font-weight: bold;">✓</span> `MountSnapshot` в `RouteViewController` / `ViewContext` |

---

## Связанные документы

- [NESTED_ROUTES.md](../NESTED_ROUTES.md) — целевой HTML API
- [INCREMENTAL_RENDER.md](../INCREMENTAL_RENDER.md) — R1, R5, ViewHandle
- [FEATURE_PARITY_ROADMAP.md §P0-1, P0-5](../comparison/FEATURE_PARITY_ROADMAP.md)
- [DATAGRAPH.md](./DATAGRAPH.md)
- [CONTENT_CACHE.md](./CONTENT_CACHE.md)
- [IMPLEMENTATION_STEPS.md §6](../IMPLEMENTATION_STEPS.md) — сверка фаз (2026-07-06)

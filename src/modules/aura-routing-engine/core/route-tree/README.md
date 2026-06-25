# route-tree

Модуль nested route tree и **branch diff** для `TransitionMap`.

Превращает декларативные `<aura-route>` в in-memory дерево и вычисляет, какие узлы **deactivate** (exit) и **activate** (enter) при переходе `from → to`. Модель совпадает с [NAVIGATION_TRANSACTION_MODEL.md](../../../../docs/NAVIGATION_TRANSACTION_MODEL.md): deactivate идёт leaf → LCA, activate — LCA → leaf.

**Статус:** registry, transition plan и engine/matcher wiring (`chain` при match) — готово.

---

## Файлы и порядок чтения

| Файл | Роль |
|------|------|
| `route-node.types.ts` | `RouteNode`, `RouteTreeSnapshot` |
| `resolve-pattern.ts` | `segment` + parent → `pattern` |
| `build-route-tree.ts` | flat/DOM `<aura-route>` → дерево |
| `matched-chain.ts` | `MatchedRouteInfo.chain`, leaf, ключи сравнения |
| `branch-diff.ts` | LCA + `exitRoutes` / `enterRoutes` |
| `transition-plan.ts` | `buildTransitionPlan()` → `TransitionMap` |
| `index.ts` | public exports модуля |

Публичная точка — `buildTransitionPlan()` из `transition/plan.ts` (реализация здесь).

---

## Фаза 1: resolve pattern

Правила склейки (см. [NESTED_ROUTES.md](../../../../docs/NESTED_ROUTES.md)):

| Child `path` | Parent `pattern` | Результат |
|--------------|-------------------|-----------|
| `profile` | `/settings` | `/settings/profile` |
| `/users` | `/settings` | `/users` (absolute, prefix родителя не добавляется) |
| `""` | `/settings` | `/settings` (index child) |
| `*` | `/users` | `/users/*` (scoped catch-all) |
| `*` | `null` / `/` | `*` (global catch-all) |

```html
<aura-route path="/settings">
  <aura-route path="profile"></aura-route>
  <aura-route path="security"></aura-route>
</aura-route>
```

→ `pattern`: `/settings/profile`, `/settings/security`.

---

## Фаза 2: build route tree

```text
buildRouteTree(routes[])
  │
  ├─ buildParentChildHierarchy()  один проход: parent → children (O(n))
  │    rootRoutes = routes без parent в knownRoutes
  │
  └─ buildRouteNode()      рекурсия по children
       ├─ pattern = resolvePattern(parent, segment)
       ├─ node.branch = parent.branch + [node]
       └─ matchableNodes: листья + index children
```

**Matchable node** — endpoint для URL matcher:

- узел **без детей**;
- **index** child (`path=""`).

Parent с детьми, но без index, сам по себе не matchable (URL задаёт child).

**DOM fallback:** если в input-массиве нет дочерних элементов, но они есть в DOM — `querySelectorAll(':scope > aura-route')`.

**На выходе `RouteTreeSnapshot`:**

- `roots` — верхний уровень под router;
- `nodesByPattern` — lookup `Map`;
- `matchableNodes` — паттерны для matcher.

`AuraRoutingRouteRegistry.buildTree()` сохраняет snapshot и кэширует `getMatchablePatterns()`.

---

## Фаза 3: matched chain

При match engine (будущий wiring) заполняет у `MatchedRouteInfo`:

```typescript
interface MatchedRouteInfo {
  // ... href, pathname, route, params ...
  node?: RouteNode;
  chain?: MatchedRouteInfo[];  // root → leaf активной ветки
}
```

Пока `chain` нет — flat fallback: цепочка = `[info]`. Nested diff работает полностью, когда `chain` заполнен.

`node.branch` — готовая цепочка `RouteNode[]` для сборки `chain` без повторного обхода parent.

---

## Фаза 4: branch diff (LCA)

Две цепочки **root → leaf**:

```text
/settings/profile  →  chain: [ settings, profile ]
/settings/security →  chain: [ settings, security ]
```

**LCA** — deepest общий prefix по `pattern`:

```text
findBranchLcaIndex → 0  (settings)
lca = chain[0]
```

| Списки | Правило |
|--------|---------|
| `exitRoutes` | узлы **ниже** LCA в `fromChain`, порядок **leaf → root** |
| `enterRoutes` | узлы **ниже** LCA в `toChain`, порядок **root → leaf** |
| `lca` | узел на границе; **не** входит в exit/enter |

Если общего prefix нет (`lcaIndex === -1`):

- `exitRoutes` = вся `fromChain` reversed;
- `enterRoutes` = вся `toChain`.

**`findLcaNodes(a, b)`** — альтернатива O(depth) по `parent`/`depth`, когда известны leaf-узлы одного дерева (без массивов chain).

---

## Фаза 5: transition plan

`buildTransitionPlan(from, to)` → `TransitionMap`:

```typescript
interface TransitionMap {
  exitRoutes: MatchedRouteInfo[];
  enterRoutes: MatchedRouteInfo[];
  lca: MatchedRouteInfo | null;
  reenter: boolean;
}
```

Три сценария:

| Сценарий | Условие | exit | enter | reenter |
|----------|---------|------|-------|-----------|
| Cold enter | `from === null` | `[]` | вся `to.chain` | `false` |
| Reentered | тот же pathname + search + leaf | `[]` | `[leaf]` | `true` |
| Branch diff | иначе | `buildExitRoutes` | `buildEnterRoutes` | `false` |

`ProcessorPipeline` уже итерирует `exitRoutes` / `enterRoutes` — nested не требует новых фаз pipeline.

---

## Примеры переходов

Дерево:

```text
/                    (home)
/settings            (layout)
  /settings/profile
  /settings/security
```

### 1. Cold enter: `/` → `/settings/profile`

```text
from: null
to.chain:   [ settings, profile ]

exitRoutes:  []
enterRoutes: [ settings, profile ]
lca:         null
```

Lifecycle: parent enter → layout render → child enter → child render.

### 2. Sibling switch: `/settings/profile` → `/settings/security`

```text
from.chain:  [ settings, profile ]
to.chain:    [ settings, security ]
LCA:         settings (index 0)

exitRoutes:  [ profile ]
enterRoutes: [ security ]
```

Layout `/settings` **не** unmount — только child меняется.

### 3. Branch exit: `/settings/profile` → `/`

```text
from.chain:  [ settings, profile ]
to.chain:    [ home ]
LCA:         нет (index -1)

exitRoutes:  [ profile, settings ]   // leaf → root
enterRoutes: [ home ]
```

### 4. Flat routes (backward compat)

```text
from: /a   chain: [ a ]
to:   /b   chain: [ b ]

exitRoutes:  [ a ]
enterRoutes: [ b ]
lca:         null
```

Поведение совпадает с flat `buildTransitionPlan` до nested.

### 5. Reentered

```text
/settings/profile?tab=1  →  /settings/profile?tab=1
(same pathname, search, leaf)

exitRoutes:  []
enterRoutes: [ profile ]
reenter:   true
```

Processor идёт в `runReentered` без leave/enter/load/render.

---

## Схема потока

```mermaid
flowchart LR
  DOM["DOM aura-route"]
  TREE["buildRouteTree"]
  REG["RouteRegistry"]
  MATCH["UrlMatcher + chain"]
  PLAN["buildTransitionPlan"]
  PROC["ProcessorPipeline"]

  DOM --> TREE --> REG
  REG --> MATCH
  MATCH --> PLAN --> PROC
```

```text
AuraRouter.refreshRoutes()
  └─ registry.replace(routes)
       └─ buildRouteTree()
            └─ nodesByPattern, matchableNodes, branch

navigate(from, to)
  └─ matchPath(pathname, registry.getMatchableNodes())
  └─ toRouteInfo(..., node) → MatchedRouteInfo + chain
  └─ buildTransitionPlan(from, to) → branch diff
  └─ processor.run({ plan })
```

---

## Тесты

```
test/
  helpers/                     (create-test-route, test-route-dom)
  route-tree/
    resolve-pattern.test.ts
    build-route-tree.test.ts   (DOM nested tree)
    branch-diff.test.ts        (LCA, findLcaNodes)
    transition-plan.test.ts    (transition scenarios)
  match/
    url-matcher-tree.test.ts
  history/
    fake-provider.test.ts
  registry.test.ts
  engine-tree-integration.test.ts
```

Запуск: `npm test` из корня репозитория.

---

## Связанные документы

- [NESTED_ROUTES.md](../../../../docs/NESTED_ROUTES.md) — целевой HTML API, outlet, lifecycle
- [NAVIGATION_TRANSACTION_MODEL.md](../../../../docs/NAVIGATION_TRANSACTION_MODEL.md) — deactivate/activate, commit point
- [NEW_ENGINE_ARCHITECTURE_ROADMAP.md](../../../../docs/NEW_ENGINE_ARCHITECTURE_ROADMAP.md) — P2 tree + engine wiring

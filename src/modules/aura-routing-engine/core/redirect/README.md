# redirect

Модуль **pre-commit** разрешения редиректов: обход цепочки declarative `redirect` на маршрутах и guard-only walk для hook-redirect **до** commit history и render.

Redirect resolution не меняет DOM и не пишет в history — только вычисляет финальный leaf (`MatchedNavigationTarget`) и политику `replace` для последующего `NavigationCoordinator.run` (полный `leave → guard → load` в pipeline).

Синхронный путь (`followDeclarativeRedirects`) используется в prefetch и диагностике. Полный путь (`followRedirectsWithGuardWalk`) — в [`navigation/navigation-coordinator.ts`](../navigation/navigation-coordinator.ts).

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Концепции](#концепции)
- [Пайплайн](#пайплайн)
- [Публичный API](#публичный-api)
- [Типы результата](#типы-результата)
- [Контекст цепочки](#контекст-цепочки)
- [Один шаг: lookupNavigationStep](#один-шаг-lookupnavigationstep)
- [Охранники цепочки](#охранники-цепочки)
- [Blocking probe](#blocking-probe)
- [Политики URL](#политики-url)
- [Контракты](#контракты)
- [Интеграция](#интеграция)
- [Структура модуля](#структура-модуля)
- [См. также](#см-также)

---

## Быстрый старт

Импорт из barrel модуля или `aura-routing-engine/core`:

```ts
import {
  followDeclarativeRedirects,
  followRedirectsWithGuardWalk,
  MAX_REDIRECTION_STEPS,
} from '…/core/redirect';
```

### Sync — только declarative `redirect` (prefetch, диагностика)

```ts
const outcome = followDeclarativeRedirects(matcher, '/settings?tab=1#panel', matchableNodes);

if (outcome.status === 'resolved') {
  const leaf = outcome.target; // MatchedNavigationTarget
  // leaf.href === '/settings/profile?tab=1#panel' при redirect attr /settings → /settings/profile
}

if (outcome.status === 'redirect-error') {
  // outcome.code: 'redirect-cycle' | 'redirect-depth-exceeded'
}
```

### Async — declarative + blocking hooks (навигация)

```ts
const result = await followRedirectsWithGuardWalk(
  {
    engine,
    matcher,
    getMatchableNodes: () => registry.getMatchableNodes(),
    isActive: () => coordinator.isAttemptCurrent(attempt),
  },
  {
    href: resolvedDocumentHref,
    from: committedRoute,
    action: 'push',
    options: navigateOptions,
  },
);

if (result.status === 'resolved') {
  await coordinator.run({
    to: result.target,
    href: result.target.href,
    hash: result.target.hash,
    action: 'push',
    options: { ...navigateOptions, replace: result.replace },
  });
}
```

---

## Концепции

### Два entry point — одна цепочка, разная глубина

| Функция | Режим | Hooks | Потребитель |
|---------|-------|-------|-------------|
| `followDeclarativeRedirects` | sync | нет | `PrefetchPlanResolver`, тесты, диагностика |
| `followRedirectsWithGuardWalk` | async | guard walk (hook redirect) | `NavigationCoordinator.navigate` |

Обе функции:

- идут по цепочке с лимитом `MAX_REDIRECTION_STEPS`;
- используют `RedirectionContext` и общие охранники depth/cycle;
- на каждом шаге вызывают `lookupNavigationStep`;
- сохраняют `search` / `hash` исходного запроса на финальном leaf.

Разница: async-путь после leaf-match запускает **guard-only probe** для hook-redirect; `leave → guard → load` выполняет **full pipeline** в `coordinator.run`.

### Два источника redirect-hop

| Источник | Когда | Откуда `nextHref` |
|----------|-------|-------------------|
| Declarative | `lookupNavigationStep` → `kind: 'redirect'` | атрибут `redirect` на узле дерева |
| Hook | `runGuardWalkProbe` → `done: false` | `guard` вернул redirect |

Оба источника сходятся в `tryApplyRedirectStep` (depth + cycle + обновление `RedirectionContext`).

### `NavigationMatchStep` vs outcome

| Уровень | Тип | Смысл |
|---------|-----|-------|
| Один href | `NavigationMatchStep \| null` | leaf, declarative hop или нет маршрута |
| Вся цепочка (sync) | `DeclarativeRedirectOutcome` | `status: resolved \| unmatched \| redirect-error` |
| Вся цепочка (async) | `RedirectResolveResult` | + `terminal`, `replace` |

`MatchedNavigationTarget` — leaf с тегом `kind: 'matched'` и флагом `viaRedirect` (см. ниже).

---

## Пайплайн

### Общий цикл (оба entry point)

```text
href
  │
  ▼
createRedirectionContext
  │
  ▼
┌─ for step = 0 .. MAX_REDIRECTION_STEPS ─────────────────────────────┐
│  lookupNavigationStep(stepHref, preserved search/hash)              │
│       │                                                             │
│       ├─ null ──────────────► unmatched                             │
│       │                                                             │
│       ├─ kind: redirect ────► tryApplyRedirectStep ──► continue     │
│       │                                                             │
│       └─ kind: matched ─────► [sync: return resolved]               │
│                               [async: runGuardWalkProbe]              │
│                                     │                               │
│                                     ├─ hook redirect ─► tryApply…     │
│                                     ├─ terminal ─────► stop           │
│                                     └─ ok ───────────► resolved       │
└─────────────────────────────────────────────────────────────────────┘
  (defensive fallthrough: depthExceeded — практически недостижим)
```

### Sync (`followDeclarativeRedirects`)

```text
lookupNavigationStep
  ├─ redirect attr ──► tryApplyRedirectStep ──► next iteration
  └─ leaf ─────────► applyRedirectArrivalFlag ──► { status: 'resolved', target }
```

Hooks **не** запускаются. Подходит, когда нужен только финальный маршрут для плана prefetch.

### Async (`followRedirectsWithGuardWalk`)

```text
lookupNavigationStep
  ├─ redirect attr ──► tryApplyRedirectStep ──► next iteration
  └─ leaf ─────────► runGuardWalkProbe (guard only)
                        │
                        ├─ hook redirect ──► tryApplyRedirectStep ──► next
                        ├─ cancel / error ─► { status: 'terminal', probe }
                        └─ ok ─────────────► { status: 'resolved' }
                                             └─► coordinator.run → leave → guard → load
```

Probe — `NavigationTransaction` с id `0` / `0`, **только guard** на candidate leaf (без leave/load/render). Полный blocking — в [`runFullPipeline`](../navigation/navigation-transaction-pipeline.ts).

---

## Публичный API

Экспорт из `index.ts` намеренно узкий.

| Группа | Символы |
|--------|---------|
| Entry points | `followDeclarativeRedirects`, `followRedirectsWithGuardWalk` |
| Context | `createRedirectionContext`, `navigationVisitKey`, `MAX_REDIRECTION_STEPS` |
| Match step | `lookupNavigationStep`, `resolveRedirectHref` |
| Types | `DeclarativeRedirectOutcome`, `RedirectResolveResult`, `RedirectErrorOutcome`, `RedirectionContext`, `RedirectResolverContext`, `RedirectMatcher`, `MatchedNavigationTarget`, `NavigationMatchStep` |

**Не в barrel** (внутренние): `tryApplyRedirectStep`, `applyRedirectArrivalFlag`, `runGuardWalkProbe`, `RedirectChainInput`, `BlockingPhasesProbeOutcome`.

---

## Типы результата

Обе ветки используют дискриминант **`status`**. Ошибки — общий `RedirectErrorOutcome`.

### Sync — `DeclarativeRedirectOutcome`

| `status` | Значение |
|----------|----------|
| `resolved` | Финальный leaf в `target`; `target.viaRedirect === true`, если был хотя бы один hop |
| `unmatched` | `href` — `stepHref`, где match не нашёлся; `onNotFound` / history |
| `redirect-error` | `code`: `redirect-cycle` или `redirect-depth-exceeded`; поле `href` — контекст ошибки |

### Async — `RedirectResolveResult`

| `status` | Значение |
|----------|----------|
| `resolved` | Финальный `target`; `replace` — нужен ли `history.replace`; blocking phases — в full pipeline |
| `unmatched` | Нет маршрута для `stepHref`; поле `href` — URL шага, где match упал |
| `redirect-error` | Как в sync |
| `terminal` | Hook short-circuit: `cancelled`, `error`, и т.д.; `probe` — probe-транзакция для finalize |

Пример обработки в coordinator:

```ts
if (chain.status === 'redirect-error') { host.handleRedirectError(...); /* onNavigationError */ }
if (chain.status === 'terminal') { host.finalizeResolveTerminal(chain.result, chain.probe); }
if (chain.status === 'unmatched') { host.handleUnmatchedNavigation(chain.href, ...); }
if (chain.status === 'resolved') {
  const historyOptions = {
    ...options,
    replace: chain.replace || chain.target.viaRedirect || slashFix || options.replace,
  };
  await run({ to: chain.target, ... });
}
```

---

## Контекст цепочки

### `RedirectionContext`

| Поле | Роль |
|------|------|
| `originalUrlParts` | Исходный href (`pathname` + `search` + `hash`); **не мутируется** |
| `stepHref` | Текущий href в цепочке (меняется на каждом hop) |
| `visitedPathnames` | Нормализованные pathname-ключи для детекции циклов |
| `viaRedirect` | `true` после первого успешного hop |
| `historyReplace` | Начальное `options.replace` + накопление из hook-redirect (`replace` / `pop`) |

Создаётся через `createRedirectionContext`. Стартовый pathname сразу попадает в `visitedPathnames`.

### `RedirectResolverContext`

Зависимости для async-пути:

| Поле | Назначение |
|------|------------|
| `engine` | Probe `NavigationTransaction` и hook registry |
| `matcher` | `RedirectMatcher` — `matchPath` + `toRouteInfo` |
| `getMatchableNodes` | Снимок узлов registry generation |
| `isActive` | `true`, пока attempt navigate актуален; `false` после supersede — probe видит stale через `NavigationTransaction.isActive()` |

---

## Один шаг: lookupNavigationStep

Файл `match-step.ts`. По одному `href` определяет **шаг навигации**:

```text
resolveDocumentHrefParts(href).pathname
  │
  ▼
matchPath(stripTrailingSlash(pathname))
  │
  ├─ нет узла ─────────────► null
  ├─ route.type === redirect ► { kind: 'redirect', href: resolveRedirectHref(...) }
  └─ leaf ───────────────────► canonical index folder href
                                 + toRouteInfo(preserved search/hash)
                                 ► { kind: 'matched', viaRedirect: false, ... }
```

### `resolveRedirectHref`

Разворачивает значение атрибута `redirect`:

- относительный target — от pattern родителя (`resolvePattern`);
- абсолютный in-app path — как есть;
- результат — **path-only** app-relative href (без search/hash).

### Index folder

Для index child под folder [`applyCanonicalIndexFolderHref`](../match/canonical-index-href.ts) может добавить trailing `/` на pathname leaf (`/app/settings` → `/app/settings/`), при этом `search` / `hash` остаются из исходного запроса.

---

## Охранники цепочки

### Лимит глубины

`MAX_REDIRECTION_STEPS` = **5**. Счётчик `step` в цикле: `0 .. MAX` (включительно).

`tryApplyRedirectStep` при `step >= MAX_REDIRECTION_STEPS` возвращает:

```ts
{ status: 'redirect-error', code: 'redirect-depth-exceeded', href: redirection.stepHref }
```

### Детекция цикла

Ключ посещения — `navigationVisitKey`:

```ts
stripTrailingSlash(resolveDocumentHrefParts(href).pathname)
```

`/a` и `/a/` — **один** ключ. Повторное посещение → `redirect-cycle`.

### Порядок проверок на hop

1. depth exceeded  
2. cycle (`visitedPathnames.has(nextKey)`)  
3. запись в `visitedPathnames`, обновление `stepHref`, `viaRedirect = true`

---

## Guard walk probe

`runGuardWalkProbe` (private) — guard-only probe на candidate leaf. Пропускается, если на enter routes нет `hasGuard` (см. `enterChainHasGuard` по pre-built plan).

```text
buildTransitionPlan(from, target)
  │
  ├─ enter routes без guard ──► resolved (без transaction)
  │
  └─ иначе:
        new NavigationTransaction(0, 0, { from, to: target, ... })
          │
          ▼
        probe.transitionPlan = plan (reuse)
          │
          ▼
        probe.runGuardPhase()
          │
          ├─ { status: 'redirect', url } ──► done: false, href: url
          ├─ другой terminal ────────────────► done: true, status: 'terminal'
          └─ null ───────────────────────────► done: true, status: 'resolved'
                                             └─► coordinator.run → runFullPipeline
```

`leave → guard → load` выполняется **только** в full pipeline после resolve, не в probe. Guard на финальном hop может выполниться **дважды** (walk + pipeline) — см. оптимизацию #4 в roadmap.

---

## Политики URL

### Search / hash

| Что | Поведение |
|-----|-----------|
| Исходный запрос | `originalUrlParts.search` / `hash` сохраняются на всей цепочке |
| Declarative redirect target | path-only; search/hash **не** берутся из attr |
| Hook redirect URL | следующий `stepHref`; search/hash leaf по-прежнему из **исходного** запроса |
| Финальный `target.href` | `canonical pathname` + preserved search + preserved hash |

### `viaRedirect` и `replace`

| Флаг | Кто выставляет | Зачем |
|------|----------------|-------|
| `redirection.viaRedirect` | `tryApplyRedirectStep` | «мы уже внутри цепочки» |
| `target.viaRedirect` | `applyRedirectArrivalFlag` | донести флаг на leaf для coordinator |
| `result.replace` | probe + `historyReplace` + `target.viaRedirect` | `history.replaceState` вместо `pushState` |

Coordinator дополнительно учитывает slash-fix и `options.replace`.

---

## Контракты

| Ситуация | Поведение |
|----------|-----------|
| Redirect attr → несуществующий path | Следующий `lookupNavigationStep` → `unmatched` |
| Цикл `/a → /b → /a` | `redirect-error` / `redirect-cycle` |
| Trailing slash `/a` vs `/a/` в цикле | Один ключ — цикл ловится |
| Superseded navigate (`isActive() === false`) | Probe: `isTransactionStale` → `transaction.isActive()` false; после `await` coordinator проверяет `isAttemptCurrent` и не запускает `run` |
| `terminal` из probe | Coordinator вызывает `finalizeResolveTerminal` — без full pipeline run |
| Prefetch plan | `followDeclarativeRedirects`; при `status !== 'resolved'` → plan `null` |

**Не делает redirect module:**

- commit history / scroll / render;
- post-commit hooks (`afterRender`, и т.д.);
- обработку hash-only shortcut (остаётся в engine до coordinator).

---

## Интеграция

```text
AuraRoutingEngine.navigateTo
  ├─ hash-only shortcut (engine, без redirect module)
  └─ NavigationCoordinator.navigate
        ├─ followRedirectsWithGuardWalk
        │     ├─ lookupNavigationStep (match-step)
        │     └─ NavigationTransaction.runGuardPhase (guard walk, skip без hasGuard)
        ├─ plan() — noop / cancel-pending / run
        └─ coordinator.run → runFullPipeline (leave → guard → load)

PrefetchPlanResolver.resolve
  └─ followDeclarativeRedirects
        └─ buildTransitionPlan(from, target) → PrefetchPlan
```

```text
redirect/
  ◄── match/url-matcher (matchPath, toRouteInfo)
  ◄── route-tree (RouteNode, resolvePattern)
  ◄── match/canonical-index-href
  ──► navigation/coordinator (RedirectResolveResult)
  ──► prefetch/plan (DeclarativeRedirectOutcome)
```

---

## Структура модуля

```text
redirect/
├── index.ts              barrel (public API)
├── types.ts              union types, RedirectionContext, outcomes
├── match-step.ts         lookupNavigationStep, resolveRedirectHref
└── redirect-resolver.ts  chain loop, guards, blocking probe orchestration
```

| Файл | Ответственность |
|------|-----------------|
| `match-step.ts` | Один href → leaf / redirect hop / null |
| `redirect-resolver.ts` | Цикл цепочки, `tryApplyRedirectStep`, entry points |
| `types.ts` | Все публичные и внутренние типы модуля |

---

## См. также

- [`navigation/`](../navigation) — coordinator, full pipeline после redirect resolve
- [`navigation/navigation-transaction-pipeline.ts`](../navigation/navigation-transaction-pipeline.ts) — `runGuardPhase`, `runFullPipeline`
- [`prefetch/`](../prefetch) — `PrefetchPlanResolver` и sync redirect lookup
- [`match/url-matcher.ts`](../match/url-matcher.ts) — `MatchedRouteInfo`, matcher
- [`guard.types.ts`](../guard.types.ts) — контракт redirect из blocking hooks
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — sequence diagram навигации

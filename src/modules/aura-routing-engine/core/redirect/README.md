# redirect

Модуль **pre-commit** разрешения редиректов: обход цепочки declarative `redirect` на маршрутах и blocking walk (`leave` → `guard`) для hook-redirect **до** commit history и render.

Redirect resolution не меняет DOM и не пишет в history — только вычисляет финальный leaf (`MatchedNavigationTarget`) и политику `replace` / `skipBlockingPhases` для последующего `NavigationCoordinator.run` (load/render в pipeline; `leave` + `guard` в walk или pipeline — см. ниже).

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
- [Blocking walk](#blocking-walk)
- [Почему так устроен blocking walk](#почему-так-устроен-blocking-walk)
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
    skipBlockingPhases: result.skipBlockingPhases,
  });
}
```

---

## Концепции

### Два entry point — одна цепочка, разная глубина

| Функция | Режим | Hooks | Потребитель |
|---------|-------|-------|-------------|
| `followDeclarativeRedirects` | sync | нет | `PrefetchPlanResolver`, тесты, диагностика |
| `followRedirectsWithGuardWalk` | async | blocking walk (`leave` → `guard`, hook redirect) | `NavigationCoordinator.navigate` |

Обе функции:

- идут по цепочке с лимитом `MAX_REDIRECTION_STEPS`;
- используют `RedirectionContext` и общие охранники depth/cycle;
- на каждом шаге вызывают `lookupNavigationStep`;
- сохраняют `search` / `hash` исходного запроса на финальном leaf.

Разница: async-путь после leaf-match запускает **blocking walk** (`runGuards`: `leave` → `guard`) на hops, где в transition plan есть `hasLeave` на exit или `hasGuard` на enter. После resolve coordinator передаёт `skipBlockingPhases`, чтобы pipeline не дублировал те же фазы.

### Два источника redirect-hop

| Источник | Когда | Откуда `nextHref` |
|----------|-------|-------------------|
| Declarative | `lookupNavigationStep` → `kind: 'redirect'` | атрибут `redirect` на узле дерева |
| Hook | `runBlockingWalkProbe` → `done: false` | `guard` или `leave` вернул redirect |

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
│                               [async: runBlockingWalkProbe]           │
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
  └─ leaf ─────────► plan.needsBlockingWalk?
                        ├─ нет ──► resolved (skipBlockingPhases от blockingPhasesCompleted)
                        └─ да ───► runBlockingWalkProbe (leave → guard)
                                      │
                                      ├─ hook redirect ──► tryApplyRedirectStep ──► next
                                      ├─ cancel / error ─► { status: 'terminal', probe }
                                      └─ ok ─────────────► { status: 'resolved', skipBlockingPhases }
                                                           └─► coordinator.run → load → render
```

Probe — `NavigationTransaction` с id `0` / `0`, вызывает `runRedirectCollapse()` → `runGuards()` 
(полный `leave` → `guard` для **текущего** `buildTransitionPlan(from, target)`). Load/render — только в [`runFullPipeline`](../navigation/navigation-transaction-pipeline.ts).

---

## Публичный API

Экспорт из `index.ts` намеренно узкий.

| Группа | Символы |
|--------|---------|
| Entry points | `followDeclarativeRedirects`, `followRedirectsWithGuardWalk` |
| Context | `createRedirectionContext`, `navigationVisitKey`, `MAX_REDIRECTION_STEPS` |
| Match step | `lookupNavigationStep`, `resolveRedirectHref` |
| Types | `DeclarativeRedirectOutcome`, `RedirectResolveResult`, `RedirectErrorOutcome`, `RedirectionContext`, `RedirectResolverContext`, `RedirectMatcher`, `MatchedNavigationTarget`, `NavigationMatchStep` |

**Не в barrel** (внутренние): `tryApplyRedirectStep`, `applyRedirectArrivalFlag`, `runBlockingWalkProbe`, `plan.needsBlockingWalk`, `RedirectChainInput`, `BlockingPhasesProbeOutcome`.

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
| `resolved` | Финальный `target`; `replace` — нужен ли `history.replace`; `skipBlockingPhases` — pipeline пропускает `runGuards` |
| `unmatched` | Нет маршрута для `stepHref`; поле `href` — URL шага, где match упал |
| `redirect-error` | Как в sync |
| `terminal` | Hook short-circuit: `cancelled`, `error`, и т.д.; `probe` — probe-транзакция для finalize |

Пример обработки в coordinator:

```ts
if (chain.status === 'redirect-error') { host.handleRedirectError(...); /* pulse.settle → navigation:error */ }
if (chain.status === 'terminal') { host.finalizeResolveTerminal(chain.result, chain.probe); }
if (chain.status === 'unmatched') { host.handleUnmatchedNavigation(chain.href, ...); }
if (chain.status === 'resolved') {
  const historyOptions = {
    ...options,
    replace: chain.replace || chain.target.viaRedirect || slashFix || options.replace,
  };
  await run({ to: chain.target, skipBlockingPhases: chain.skipBlockingPhases, ... });
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
| `blockingPhasesCompleted` | `true` после хотя бы одного успешного blocking walk probe в этой цепочке; влияет на `skipBlockingPhases`, если финальный hop без `leave`/`guard` |

Создаётся через `createRedirectionContext`. Стартовый pathname сразу попадает в `visitedPathnames`.

### `RedirectResolverContext`

Зависимости для async-пути:

| Поле | Назначение |
|------|------------|
| `engine` | Probe `NavigationTransaction` и hook registry |
| `matcher` | `RedirectMatcher` — `matchPath` + `buildMatchedRouteInfo` |
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
                                 + buildMatchedRouteInfo(preserved search/hash)
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

## Blocking walk

`runBlockingWalkProbe` (private) — pre-commit `leave` → `guard` на candidate leaf. Запускается, когда `plan.needsBlockingWalk` видит `hasLeave` на **exit** или `hasGuard` на **enter** в `buildTransitionPlan(from, target)`.

```text
buildTransitionPlan(from, target)
  │
  ├─ нет hasLeave на exit и нет hasGuard на enter ──► resolved без probe
  │     (skipBlockingPhases = redirection.blockingPhasesCompleted)
  │
  └─ иначе:
        new NavigationTransaction(0, 0, { from, to: target, ... })
          │
          ▼
        probe.transitionPlan = plan (reuse)
          │
          ▼
        probe.runRedirectCollapse()  →  pipeline.runGuards()  →  leave → guard
          │
          ├─ { status: 'redirect', url } ──► done: false, href: url
          ├─ другой terminal ────────────────► done: true, status: 'terminal'
          └─ null ───────────────────────────► done: true, status: 'resolved'
                                                skipBlockingPhases: true
                                             └─► coordinator.run (load → render)
```

`blockingPhasesCompleted` выставляется после каждого probe-вызова (даже если guard redirect продолжил цепочку). Coordinator передаёт `skipBlockingPhases` в transaction; `runFullPipeline` не вызывает `runGuards` повторно.

---

## Почему так устроен blocking walk

### 1. `leave` и `guard` вместе в walk, не только `guard`

Pipeline требует порядок **`leave` (exit) → `guard` (enter)`**. Если в walk вызывать только `guard`, при hook-redirect получится:

```text
guard (walk) → … цепочка … → leave (pipeline)   // нарушение политики
```

Поэтому probe вызывает `runGuards()` целиком — `leave` перед `guard` на каждом blocking-hop.

### 2. Полный `runGuards` на каждом hop, без дедупликации exit routes

Альтернатива — инкрементальный `leave` (только новые exit routes в diff между hop'ами). Это корректнее при guard-redirect на другую ветку, но заметно усложняет resolver (`completedLeavePatterns`, пошаговый leave, отдельные флаги для guard).

**Выбран более простой вариант:** на каждом hop, где `plan.needsBlockingWalk`, снова `runGuards()` для **текущего** transition plan. Пересекающиеся exit routes могут получить `leave` **дважды** (типично 2–3 hop'а в реальных цепочках).

| Плюс | Минус |
|------|-------|
| Простой код, легко сопровождать | Повторный `leave` на том же route |
| Сохраняется leave → guard | `leave`-хуки должны быть идемпотентными |
| Расширенный exit diff подхватывается на следующем hop | — |

Рекомендация для приложений: `leave` без побочных эффектов «один раз за навигацию»; cleanup — в `unmount` / `ready`.

### 3. Когда probe повторяется в цепочке

```text
/app/settings → /app/dashboard (guard → /login) → /login

hop 1: leave(settings) + guard(dashboard) → redirect
hop 2: leave(settings) + leave(app)       ← settings повторно; app впервые
```

Guard-redirect на промежуточном hop не останавливает walk: следующий candidate снова проходит `plan.needsBlockingWalk`. Финальный hop без `leave`/`guard` всё равно получает `skipBlockingPhases: true` через `blockingPhasesCompleted`.

### 4. Что не делаем (намеренно)

- **Финальный leave-pass после resolve** — дал бы `guard → leave` для exit routes, появившихся только на финальном плане.
- **Инкрементальный leave** — точнее, но избыточен при `MAX_REDIRECTION_STEPS = 5` и коротких prod-цепочках.
- **Guard-only walk + leave в pipeline** — ломает порядок фаз при hook-redirect до commit.

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
        │     └─ runBlockingWalkProbe → runRedirectCollapse (leave → guard, skip без hasLeave/hasGuard)
        ├─ plan() — noop / cancel-pending / run
        └─ coordinator.run → runFullPipeline (load → render; runGuards если !skipBlockingPhases)

PrefetchPlanResolver.resolve
  └─ followDeclarativeRedirects
        └─ buildTransitionPlan(from, target) → PrefetchPlan
```

```text
redirect/
  ◄── match/url-matcher (matchPath, buildMatchedRouteInfo)
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
- [`navigation/navigation-transaction-pipeline.ts`](../navigation/navigation-transaction-pipeline.ts) — `runGuards`, `runFullPipeline`, `skipBlockingPhases`
- [`prefetch/`](../prefetch) — `PrefetchPlanResolver` и sync redirect lookup
- [`match/url-matcher.ts`](../match/url-matcher.ts) — `MatchedRouteInfo`, matcher
- [`guard.types.ts`](../guard.types.ts) — контракт redirect из blocking hooks
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — sequence diagram навигации

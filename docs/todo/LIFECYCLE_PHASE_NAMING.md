# Lifecycle phase naming — переименование public API

> **Статус:** ✅ имена зафиксированы и в коде · ⬜ super advanced + docs cleanup  
> **Легенда:** ✅ — в коде · ⬜ — осталось · 🔶 — частично (engine без public attrs/ctx)  
> **Цель:** короткие HTML-атрибуты, понятные без чтения docs  
> **Область:** `<aura-route>` / `<aura-router>` lifecycle attrs, `ctx.phase`, route hooks  
> **Связь:** [LIFECYCLE_PLACEMENT.md](../LIFECYCLE_PLACEMENT.md) · [MAIN_PIPELINE.md](../MAIN_PIPELINE.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md)

---

## Статус реализации (сверка с кодом)

| Tier | Attrs | Код |
|------|-------|-----|
| **Core** | `leave` · `guard` · `load` · `ready` | ✅ `lifecycle-phases.ts`, `aura-route.ts`, `ctx.phase` |
| **Advanced** | `unmount` · `update` · `error` | ✅ attrs + pipeline + `onUnmount` / `onUpdate` / `onError` |
| **Presentation** | `transition-in` · `transition-out` · `transition-order` · `transition` | ✅ attrs + pipeline |
| **Super advanced** | `detach` · `destroy` · `restore` | ⬜ attrs; 🔶 `preserve` + detach/destroy во view layer |
| **Ctx фаза 1** | `ctx.teardown` · `ctx.preserved` · `ctx.restored` | ⬜ не в `RouteLifecycleContext` |
| **Router inherit** | `guard` · `ready` на `<aura-router>` | ✅ `lifecycle-inherit.test.ts` |
| **Deprecated aliases** | `enter` → `guard`, `after` → `ready`, … | ⬜ не планируются (breaking rename, см. ROUTE_API_V3) |
| **Docs** | `PHASE_NAMING.md`, чеклист ROUTE_API_V3 | ⬜ `PHASE_NAMING.md` нет; ROUTE_API_V3 — устаревший чеклист фазы 2 |

---

## Контекст

Обсуждение имён lifecycle-фаз (2026-06): какие attrs должны быть в **core** (95% маршрутов) и какие — **advanced** (редко).

Критерии выбора:

1. Короткое имя (одно слово в HTML)
2. Смысл понятен без docs
3. Для blocking-фаз явно видно, что переход **может быть остановлен**
4. Не привязываться к текущим именам в коде — их можно переименовать

### Уровни public API

| Уровень | Attrs | Доля маршрутов | Где в docs | Код |
|---------|-------|----------------|------------|-----|
| **Core** ✅ | `leave`, `guard`, `load`, `ready` | ~95% | quick start, примеры по умолчанию | ✅ |
| **Advanced** ✅ | `unmount`, `update`, `error` | редко / prod | «Advanced lifecycle» | ✅ |
| **Presentation** ✅ | `transition-in`, `transition-out`, `transition-order` | опционально | отдельная ось, не lifecycle | ✅ (+ `transition` shortcut) |
| **Super advanced** ⬜ | `detach`, `destroy`, `restore` | только `preserve` / keep-alive | отдельная секция, не в quick start | 🔶 preserve; ⬜ attrs |

Решение о super advanced **не откладывать до «массовой статистики»**: `preserve` — заявленная фича (`parsePreserveAttr`, ViewCache, `handle.detach()` / `handle.destroy()`). Контракт teardown нужен в дизайне API заранее; долю маршрутов с `preserve` до GA измерить нельзя.

**Цикл для route attrs разложен полностью** — новые lifecycle-фазы в advanced не планируются. Расширения — только presentation, super advanced (preserve) и future data/revalidate (см. §Future).

---

## Принятое решение (рекомендуемая связка)

### Core ✅

```text
leave | guard | load | ready
```

| Attr | Роль | Blocking? | Смысл одной фразой | Код |
|------|------|-----------|-------------------|-----|
| **`leave`** ✅ | guard на exit-ветке | да | Перед уходом: «можно уйти?» | ✅ |
| **`guard`** ✅ | guard на enter-ветке | да | Перед показом: «можно войти?» (auth, roles) | ✅ |
| **`load`** ✅ | data до render | да | Подгрузить данные до UI | ✅ |
| **`ready`** ✅ | post-commit effects на enter-ветке | нет | Route готов: analytics, focus, scroll restore | ✅ |

Типичный маршрут:

```html
<aura-route
  path="/profile"
  leave="confirm-unsaved"
  guard="auth"
  load="fetch-user"
  ready="analytics"
/>
```

### Advanced ✅

```text
unmount | update | error
```

| Attr | Роль | Когда нужен | Код |
|------|------|-------------|-----|
| **`unmount`** ✅ | cleanup на exit-ветке после view commit | abort fetch, save scroll, analytics «ушли» | ✅ |
| **`update`** ✅ | shortcut: тот же path/leaf, новый query/hash | без полного leave/guard/load/render | ✅ |
| **`error`** ✅ | terminal: сбой blocking/post-commit/render | логирование, toast, fallback UI | ✅ |

`error` — **не шаг обычного pipeline**, а реакция на failure. Имя в as-is не менять. Часто достаточно одного hook на `<aura-router>` с inherit на детей.

```html
<aura-router error="log-nav-error">
  <aura-route path="/search" update="sync-query" unmount="flush-cache" />
  <aura-route path="/risky" load="fetch" error="show-toast" />
</aura-router>
```

### Presentation ✅ (отдельная ось — не lifecycle)

```text
transition-in | transition-out | transition-order
```

| Attr | Роль | Почему не в lifecycle | Код |
|------|------|------------------------|-----|
| **`transition-in`** ✅ | анимация появления view | presentation, не guard/data/effect | ✅ |
| **`transition-out`** ✅ | анимация ухода view | то же | ✅ |
| **`transition-order`** ✅ | `out-in` / `in-out` / `parallel` | политика вокруг render, не hook-фаза | ✅ |
| **`transition`** ✅ | shortcut: один hook на in + out | UX sugar | ✅ |

В docs держать **отдельно** от `leave | guard | load | ready`, чтобы не смешивать «можно ли перейти» с «как анимировать».

```html
<aura-route
  path="/home"
  view="html-src::home.html"
  transition-out="fade-out"
  transition-in="fade-in"
  transition-order="out-in"
/>
```

`ctx.phase`: `transitionIn`, `transitionOut` (camelCase) — без переименования.

### Super advanced ⬜ (`preserve` / keep-alive)

```text
detach | destroy | restore
```

Только для маршрутов с **`preserve`** (view keep-alive).  
🔶 **`preserve`** attr + ViewCache detach/destroy — в коде; ⬜ отдельные lifecycle attrs и `ctx.*` — нет.

#### Exit (teardown)

| `preserve.view` | Поведение view | Будущий attr | Код |
|-----------------|----------------|--------------|-----|
| `true` | `handle.detach()` — DOM снят с outlet, subtree в ViewCache | **`detach`** ⬜ | 🔶 engine |
| `false` | `handle.destroy()` — полная очистка | **`destroy`** ⬜ | 🔶 engine |

#### Enter (reattach)

| Условие | Поведение view | Будущий attr | Код |
|---------|----------------|--------------|-----|
| ViewCache hit, `reattachContent` | DOM возвращён в outlet без полного render | **`restore`** ⬜ | 🔶 engine |
| Обычный enter / cache miss | свежий render | **`ready`** ✅ (core) | ✅ |

Симметрия keep-alive:

```text
detach  ↔  restore     (view в кэше: сняли ↔ вернули)
destroy ↔  (нет пары)   (следующий вход — обычный load + render + ready)
```

Аналог в отрасли: Vue KeepAlive — `onDeactivated` / **`onActivated`** (не `restore`; у нас `restore` — plain English и пара к `detach`).

**Фаза 1 (ship)** ⬜: без отдельных attrs — контекст на существующих фазах:

```ts
// unmount
ctx.teardown: 'detach' | 'destroy'   // ⬜
ctx.preserved: { view: boolean; data: boolean }   // ⬜ (preserve есть на route, не в ctx)

// ready
ctx.restored: boolean   // ⬜ true = reattach из ViewCache, не fresh render
```

**Фаза 2** ⬜: опциональные attrs **`detach`**, **`destroy`**, **`restore`** — super advanced. `ready` по-прежнему вызывается на каждом enter; **`restore`** — только при cache reattach (до или вместо части `ready`-логики — TBD порядок).

```html
<aura-route
  path="/editor"
  preserve
  unmount="abort-fetch"
  detach="pause-autosave"
  destroy="wipe-secrets"
  restore="resume-scroll"
  ready="analytics"
/>
```

| Attr | Когда вызывается | Код |
|------|------------------|-----|
| **`unmount`** ✅ | всегда при уходе (exit, post-commit) | ✅ |
| **`detach`** ⬜ | только `preserve.view` + detach в ViewCache | ⬜ |
| **`destroy`** ⬜ | только полный destroy (без keep-alive view) | ⬜ |
| **`restore`** ⬜ | только enter + reattach из ViewCache (`ctx.restored`) | ⬜ |
| **`ready`** ✅ | каждый enter после commit (в т.ч. после restore) | ✅ |

> **Именование:** `restore` предпочтительнее `attach` — понятнее без docs («вернули из кэша»); `attach` технически парное к `detach`, но звучит как инфраструктура outlet.

> **Порядок as-is:** на фазе `unmount` сначала `route.onUnmount()` → detach/destroy, затем user hooks. Логика **до** снятия DOM — в **`leave`** (blocking). Открытый вопрос: нужен ли pre-teardown hook — см. [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md). ⬜

> **Не WC-имена:** `connected` / `disconnected` на `<aura-route>` не использовать — коллизия с `connectedCallback` CE и другой момент времени (route element в DOM ≠ view в outlet).

---

## Полная карта API (сводка)

```text
Core (~95%):                    ✅ в коде
  leave | guard | load | ready

Advanced (редко / prod):        ✅ в коде
  unmount | update | error

Presentation (опционально):     ✅ в коде
  transition-in | transition-out | transition-order  (+ transition shortcut)

Super advanced (preserve only): 🔶 preserve · ⬜ detach | destroy | restore
```

### Полный цикл навигации

```text
                         ┌── update (shortcut: тот же leaf, новый query)
                         │
[exit] leave ────────────┼── guard ── load ── [view] ── [transitions?] ── promote ── history
                         │                                              │
                         │                         unmount ─────────────┤
                         │                         ready  ──────────────┘
                         │
                         └── preserve: detach | destroy  →  …  →  restore | ready

error — terminal-ветка при сбое на любом шаге (не в основной цепочке)
```

| Событие | Attr / механизм | Tier | Код |
|---------|-----------------|------|-----|
| Guard при уходе | `leave` | core | ✅ |
| Guard при входе | `guard` | core | ✅ |
| Data до UI | `load` | core | ✅ |
| View commit | `view` | не hook | ✅ |
| Post-commit enter | `ready` | core | ✅ |
| Post-commit exit | `unmount` | advanced | ✅ |
| Same-route refresh | `update` | advanced | ✅ |
| Сбой navigation | `error` | advanced | ✅ |
| Анимация | `transition-*` | presentation | ✅ |
| Keep-alive exit/enter | `detach` / `destroy` / `restore` | super advanced | 🔶 / ⬜ |

### Что не является отдельной фазой (attrs не добавлять)

| Сценарий | Почему |
|----------|--------|
| **Redirect / cancel** | исход `leave` / `guard` / `load` (`return false` / URL), не фаза |
| **Pop (back/forward)** | те же фазы; отличие в `ctx.action`, не новый attr |
| **Первый вход** (нет `leave`) | нормально — не все фазы обязательны на каждой навигации |
| **Prefetch** | link intent + prefetch pipeline, не navigation lifecycle |
| **Supersede / cancel job** | engine (`hookEpoch`, `navigationJob`), не route attr |
| **Render / history commit** | внутренние шаги `ProcessorPipeline`, не public hook |
| **Глобальные hooks** | `AURARouter.use()` + inherit attrs на `<aura-router>`, не новые имена фаз |

### Future (не сейчас — без новых lifecycle attrs до стабилизации)

| Тема | Направление |
|------|-------------|
| **DataGraph / `shouldRevalidate`** | расширить семантику `update` или `load`, не обязательно новый attr |
| **Pre-teardown hook** | порядок user hooks vs `onLeft()` — см. [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) |
| **`beforeEach` / `afterEach` TS API** | router-level; fallback — inherit + `guard` / `ready` на `<aura-router>` |

Подробнее: § [Будущее: parity с мировыми роутерами](#будущее-parity-с-мировыми-роутерами).

---

## Будущее: parity с мировыми роутерами

> **Назначение:** как думать о развитии API **без** раздувания списка lifecycle-фаз.  
> **Сверка:** 2026-06 · Vue Router · TanStack Router v1 · React Router 7 · Angular · SvelteKit  
> **Связь:** [TANSTACK_ROUTER_COMPARISON.md](../comparison/TANSTACK_ROUTER_COMPARISON.md) · [REACT_ROUTER_COMPARISON.md](../comparison/REACT_ROUTER_COMPARISON.md) · [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) · [FEATURE_PARITY_ROADMAP.md](../comparison/FEATURE_PARITY_ROADMAP.md)

### Главный вывод

По **именованным lifecycle-фазам (attrs)** Aura **не беднее** топовых роутеров — в ряде мест **богаче** (post-commit, transitions, явный `update`).  
Пробелы у конкурентов закрываются чаще **не новой фазой**, а **data-слоем**, router-level API и политиками на существующих `load` / `update` / `guard`.

**Не добавлять новые attrs lifecycle** ради parity, пока не ясно, что нельзя выразить через `load`, `update`, `ctx` или inherit на `<aura-router>`.

---

### Сопоставление фаз (есть ли «чужие» фазы, которых у нас нет?)

| Концепция | Vue Router | TanStack / RR7 | Angular | Aura (план) | Код |
|-----------|------------|----------------|---------|-------------|-----|
| Guard при уходе | `beforeRouteLeave` | blocker / `beforeLoad` chain | `CanDeactivate` | **`leave`** | ✅ |
| Guard при входе | `beforeEnter` | `beforeLoad` | `CanActivate` | **`guard`** | ✅ |
| Data до UI | (в компоненте) | `loader` | `Resolve` | **`load`** | ✅ |
| Post-commit enter | `afterEach` | обычно `useEffect` | — | **`ready`** | ✅ |
| Post-commit exit | — | — | — | **`unmount`** | ✅ |
| Same URL / params | `beforeRouteUpdate` | `cause: 'stay'` + revalidate | reuse strategy | **`update`** | ✅ |
| Ошибка | `onError` | `errorComponent` | resolver error | **`error`** | ✅ |
| Анимация | `<transition>` | CSS / lib | — | **`transition-*`** | ✅ |
| Keep-alive off/on | `onDeactivated` / `onActivated` | — | — | **`detach` / `restore`** | ⬜ attrs · 🔶 preserve |

**Итог:** отдельной фазы «у всех есть X, а у Aura нет attr» — **почти нет**.

---

### Где у мировых роутеров есть концепции, которых у нас нет (или частично)

Это **не обязательно новые lifecycle attrs** — часто другой слой.

| # | Концепция | У кого | У Aura | Как думать в будущем | Код |
|---|-----------|--------|--------|----------------------|-----|
| 1 | **Глобальные guards** `beforeEach` / `afterEach` | Vue | ✗ TS API; ~ inherit `guard`/`ready` на router | Router-level API или convention inherit; **не новая фаза** | 🔶 inherit ✅ · TS API ⬜ |
| 2 | **`beforeLoad` отдельно от auth** | TanStack | один слот **`guard`** | Context prep до `load` — внутри `guard` или второй hook в цепочке; split attrs только если DX потребует | ✅ |
| 3 | **`shouldRevalidate` / invalidation** | TanStack, RR7, SvelteKit | ✗; `update` — shortcut, не policy | Расширить **`load`** / **`update`** + DataGraph; см. [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | ⬜ |
| 4 | **`action` (мутации POST/form)** | Remix / RR7 | ✗ | Осознанный gap для WC/HTML-first; hooks вне router или отдельный слой, не lifecycle attr | ⬜ gap |
| 5 | **`validateSearch` / search schema** | TanStack | query в `ctx`, нет schema attr | Convention в **`guard`** или **`load`**; отдельный attr — только при HTML-first search DX | ⬜ |
| 6 | **`CanMatch` (guard на match)** | Angular | ✗ | Редко; `guard` или `path="*"`; не приоритет | ⬜ |
| 7 | **Middleware** | RR7, SvelteKit, Next | ✗ как сущность | Слой над tree; inherit + engine hooks; не путать с route lifecycle | ⬜ |
| 8 | **Pending / defer UI** (`pendingMs`, `defer`) | TanStack, RR | `loading-template` ✓; без defer policy | UX на **`load`**, не новая фаза | 🔶 loading ✅ · defer ⬜ |
| 9 | **Полный param-update** | Vue `beforeRouteUpdate` | `update` — лёгкий shortcut | Опция «full cycle на update» через policy/attr-modifier, не новое имя фазы | ✅ shortcut · ⬜ full cycle |
| 10 | **Параллельные loaders (siblings)** | TanStack, RR | sequential `enterRoutes` | Модель исполнения **`load`**; см. P0-4 [FEATURE_PARITY_ROADMAP.md](../comparison/FEATURE_PARITY_ROADMAP.md) | ⬜ |
| 11 | **`notFound` как исход** | TanStack `notFound()` | `path="*"`, handler, events | Покрыто; не lifecycle attr | ✅ |

---

### Где Aura впереди (не копировать обратно)

| Aura | Комментарий |
|------|-------------|
| Явный **`unmount`** post-commit | У RR/TanStack cleanup чаще в unmount компонента |
| **`transition-order`** (`out-in`, `parallel`) | Редко как first-class в route API |
| **`leave` + `guard`** — два blocking слота | У многих один «before» на вход |
| **`error`** как route hook + DOM events | Error UI есть везде; hook-фаза — не всегда |
| **`preserve` + detach/restore** (planned) | Ближе Vue KeepAlive, чем TanStack route API |

**Сохранять** при parity-работе — не жертвовать HTML-first и явным lifecycle ради копирования React API.

---

### Приоритет развития (не новые фазы)

Порядок «как у data router», **без** новых lifecycle attrs:

| Приоритет | Тема | Куда класть | Код |
|-----------|------|-------------|-----|
| P0 | **`shouldRevalidate` + SWR** на `load` | DataGraph, `ctx`, policy на `update` | ⬜ |
| P0 | **Параллельные loaders** | engine `runLoads`, не attr | ⬜ |
| P1 | **`beforeEach` / `afterEach`** (TS) | `AuraRouter` API + inherit fallback | ⬜ (inherit ✅) |
| P1 | **Search validation** | convention в `guard` / `load` или attr `search-schema` (не lifecycle) | ⬜ |
| P2 | **Расширенный `update`** (full re-guard/re-load по флагу) | семантика `update`, не `beforeRouteUpdate` attr | ⬜ |
| P3 | **`action` / middleware** | только при full-stack / form-heavy сценариях | ⬜ |

---

### Правило для будущих решений

```text
Нужен ли новый lifecycle attr?
  1. Можно выразить через leave | guard | load | ready | unmount | update | error?
     → да: не добавлять
  2. Это data/cache/revalidation?
     → load / update + DataGraph + ctx
  3. Это глобально на все переходы?
     → router-level API / inherit на <aura-router>
  4. Это presentation?
     → transition-* ось
  5. Это preserve keep-alive?
     → super advanced detach | destroy | restore (+ ctx)
  6. Иначе — новый attr только с RFC и примером HTML-first DX
```

---

## Альтернатива на 95% то же самое

```text
leave | guard | load | entered     ← core
left | reenter                      ← advanced
```

Спор только между парами:

| Слот | Вариант A | Вариант B | Комментарий | Решение |
|------|-----------|-----------|-------------|---------|
| post-commit (core) | **`ready`** | **`entered`** | `ready` — шире («route готов к работе»), ближе к `document.ready`; `entered` — route-native, пара к «входу» | ✅ **`ready`** |
| cleanup (advanced) | **`unmount`** | **`left`** | `unmount` — явнее для dev'ов (React/Svelte); `left` — короче, наследие Navigo | ✅ **`unmount`** |
| same-route (advanced) | **`update`** | **`reenter`** | `update` — как Vue `beforeRouteUpdate`; `reenter` — уже в коде и docs | ✅ **`update`** |

**Итог:** `leave | guard | load` — без спора. Выбор между `ready`/`entered` и `unmount`/`update` vs `left`/`reenter` — косметический; на everyday DX почти не влияет.

---

## Mapping с текущим as-is

| As-is (код / docs) | → Рекомендуемое | Примечание | Код |
|--------------------|-----------------|------------|-----|
| `enter` | **`guard`** | `enter` не кодирует blocking | ✅ переименовано |
| `after` / `afterHook` / `onAfter` | **`ready`** или **`entered`** | `after` слишком абстрактно | ✅ → **`ready`** |
| `left` / `onLeft` | **`unmount`** или **`left`** | | ✅ → **`unmount`** / `onUnmount` |
| `reenter` / `onReenter` | **`update`** или **`reenter`** | | ✅ → **`update`** / `onUpdate` |
| `error` | **`error`** | terminal; имя без изменений | ✅ |
| `transition-in` / `transition-out` | **`transition-in`** / **`transition-out`** | ось presentation, не lifecycle | ✅ |
| `leave` | **`leave`** | без изменений | ✅ |
| `load` | **`load`** | без изменений | ✅ |

`ctx.phase` (TS) — camelCase: `guard`, `ready`, `unmount`, `update` ✅ (или `entered`, `left`, `reenter` при выборе альтернативы — не выбрано).

---

## Почему не другие связки из отрасли

| Связка | Плюс | Минус |
|--------|------|-------|
| `will-leave` / `will-enter` / `load` / `did-enter` | Максимальная ясность времени (UIKit, Ember) | Длинно для everyday HTML attrs |
| `can-leave` / `can-enter` / `load` / `ready` | Явный вопрос «можно ли?» (Angular) | Длинно |
| `leave` / `allow` / `load` / `shown` | Plain English без framework-жаргона | `allow`/`shown` слабее привязаны к route |
| `leave` / `enter` / `load` / `after` | Уже близко к as-is | `enter` двусмысленен, `after` непонятен без docs |

Для короткого HTML API разработчиков оптимум: **`leave | guard | load | ready`** (+ advanced).

---

## Pipeline (не меняется)

Имена attrs не меняют порядок в engine:

```text
leave → guard → load → [view + transition-*] → promote → history → unmount → ready
shortcut (update): только update-hooks → commitGate
error: terminal-ветка при failure (вне основной цепочки)
```

В docs для пользователя — **4 блока** lifecycle, не полный список:

```text
leave/guard — можно ли?
load        — данные
ready       — route готов
```

`unmount` / `update` / `error` — «Advanced lifecycle».  
`transition-*` — «Presentation».  
`detach` / `destroy` / `restore` — «Super advanced (preserve)»; в quick start не показывать.

---

## Открытые вопросы

- [x] ✅ Финальный выбор: `ready` vs `entered` для core post-commit → **`ready`**
- [x] ✅ Финальный выбор: `unmount`/`update` vs `left`/`reenter` для advanced → **`unmount`** / **`update`**
- [ ] ⬜ Super advanced: `detach` / `destroy` / `restore` attrs vs `ctx.teardown` / `ctx.restored` (фаза 1 → фаза 2)
- [ ] ⬜ Порядок на enter: `restore` vs `ready` (оба vs только `ready` + branch)
- [ ] ⬜ Порядок: user hooks vs `onUnmount()` (pre/post teardown)
- [ ] ⬜ Deprecated aliases на переходный период (`enter` → `guard`, `after` → `ready`, …) — **решение: не планируются**
- [ ] ⬜ Обновить [ROUTE_API_V3.md](./ROUTE_API_V3.md) после фиксации имён (чеклист фазы 2 устарел)
- [x] ✅ Рефакторинг: `lifecycle-phases.ts`, `aura-route.ts` attrs, тесты
- [ ] ⬜ `PHASE_NAMING.md` — файл не создан; ссылки в docs ведут в никуда
- [ ] ⬜ Parity: `shouldRevalidate`, parallel loaders, `beforeEach`/`afterEach` — без новых lifecycle attrs (см. § parity)

---

## Пример до / после

> ✅ **Rename в коде выполнен** — ниже исторический контекст миграции v2 → v3.

```html
<!-- as-is (v2, до rename) -->
<aura-route
  path="/profile"
  leave="confirm"
  enter="auth"
  load="fetch-user"
  after="analytics"
  left="save-scroll"
  reenter="sync-query"
/>

<!-- proposed (полный пример) — ✅ целевые имена в коде -->
<aura-route
  path="/profile"
  leave="confirm"
  guard="auth"
  load="fetch-user"
  ready="analytics"
  unmount="save-scroll"
  update="sync-query"
  error="log-route-error"
  transition-in="fade-in"
  transition-out="fade-out"
/>

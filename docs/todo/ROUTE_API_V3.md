# Route API v3 — путь к public API из README

> **Эталон:** [README.md](../../README.md) — единственный источник целевых имён и примеров.  
> **Этот документ:** зачем менять, as-is в коде → README, задачи реализации.  
> **Связь:** [LIFECYCLE_PHASE_NAMING.md](./LIFECYCLE_PHASE_NAMING.md) · [VIEW_LAYER_ARCHITECTURE.md](./VIEW_LAYER_ARCHITECTURE.md)

> **Не дублировать README как второй эталон.** Если расхождение — правим код / todo, README не трогаем без явного решения.

> **Сверка с кодом:** 2026-07-10 · **✅ — готово** · **⬜ — осталось** · **🟡 — частично**

### Сводка (2026-07-10)

| Область | Статус |
|---------|--------|
| **`view` + парсер** | ✅ `parseViewAttr` → `resolvedView` → `ViewGraph.buildViewDescriptor` |
| **Loaders v3** | ✅ `url`, `html`, `template`, `component`, `import`, `iframe` в `view-graph` |
| **`extract`** | ✅ attr + inherit router → route + `UrlLoader` |
| **`cache`** | ✅ attr + wiring (`dom` / `view` / `data` / `screen` / `all` / `off`) |
| **Lifecycle v3 attrs** | ✅ `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error` на `<aura-route>` |
| **Transitions** | ✅ `transition`, `transition-order`, `transition-in` / `out` + inherit |
| **Templates / scroll inherit** | ✅ `loading-template`, `error-template`, `scroll` |
| **Старые attrs v2** | ✅ `source`, `data-content`, `keep-alive`, `cache`, `enter`, `after`, `left`, `reenter` **удалены** с route |
| **`component` validation** | ✅ warn если ref без `-`; throw если CE не зарегистрирован |
| **`detach` / `destroy` / `restore` attrs** | ⬜ отдельные attrs; поведение через `cache.dom` + `unmount` / `ready` |

---

## Зачем

> **Исторический контекст.** Большая часть v3 уже в коде (см. [сводку](#сводка-2026-07-10) выше). Ниже — проблема v2, которую решал redesign.

Сейчас на `<aura-route>` **~18 атрибутов** в трёх разных «языках». Разработчик открывает route и видит мини-справочник по движку, а не ответ на три вопроса: *куда, что, когда*.

| Группа | Текущие attrs | Проблема |
|--------|---------------|----------|
| Контент | `path`, `layout`, `source`, `content` | Два атрибута на одну мысль; `layout` и `content` взаимоисключающи, но выглядят равноправно |
| Lifecycle | `enter`, `load`, `entered`, `leave`, `left`, `reenter`, `transition-in`, `transition-out`, `error` | 9 фаз — нужно помнить порядок pipeline |
| Поведение | `keep-alive`, `cache` (v2) | Три вида кэша в одном attr `cache` (v3) |
| Шаблоны | `loading-template`, `error-template` | Дублируют router; на route почти не нужны |

---

## Принципы v3

1. **80/20 в разметке** — 3–5 attrs на типичный route.
2. **Одна мысль — один attr** — `view="ref"` или `loader::content`, не `source` + `data-content`.
3. **Lifecycle core-4** — `leave`, `guard`, `load`, `ready`; остальное advanced / presentation.
4. **Кэш и scroll — на router**, не на каждом route.
5. **Короткие имена** — без дефисов в loader id; без избыточного `url::` для default.

---

## Целевой API (из README)

Сводка — без дублирования таблиц; полный справочник в [README § `<aura-route>` attributes](../../README.md#aura-route-attributes).

```text
Route:        path | layout | view | cache
View loaders: html | url | template | component | import | iframe
Lifecycle:    leave | guard | load | ready
Advanced:     unmount | update | error
Presentation: transition | transition-in | transition-out | transition-order
Preserve+:    detach | destroy | restore   (super advanced, с cache.dom)
```

---
### Ядро (почти всегда)

```html
<aura-route path="/profile" view="component::profile-page" />
```

| Атрибут | Назначение |
|---------|------------|
| **`path`** | URL-паттерн (обязательный) |
| **`view`** | Контент: bare `ref` (default `url`) или `loader::content` |

Формат: bare **`ref`** → loader **`url`**. Иначе `loader::content` (`::` — разделитель). Селектор фрагмента — отдельный attr **`extract`**, не в `view`.

### View loaders → README

> **As-is в коде (2026-07-10):** ✅ v3 loaders в `view-graph`; attrs `view` + `layout`.

| Loader (README) | ref | Код (2026-07-10) |
|--------|-----|------------------|
| **`url`** | `profile.html` | ✅ loader `url`; bare content → default `url` |
| **`html`** | markup | ✅ `html` |
| **`template`** | template id | ✅ `template` |
| **`component`** | CE tag name | ✅ `component` (throw если CE не зарегистрирован) |
| **`import`** | module path | ✅ `import` |
| **`iframe`** | URL | ✅ builtin (`IframeLoader`, `loading="lazy"`) |

**Default:** bare `ref` → loader **`url`** (префикс `url::` не пишем):

```html
<aura-route path="/users" view="users.html" />
```

Явный `loader::` — только для **не-default** loaders (`html`, `template`, `component`, `import`, `iframe`).

Пара для CE (README):

```text
component  →  CE в registry (ref = tag name)
import     →  подгрузить модуль и зарегистрировать CE
```

Отличие от `html`: `html` — разметка; `component` — mount CE + route data.

Примеры (как в README):

```html
<aura-route path="/" view="home.html" />
<aura-route path="/x" view="html::<section>About</section>" />
<aura-route path="/404" view="template::not-found" />
<aura-route path="/dash" view="component::dashboard-page" />
<aura-route path="/app" view="import::./pages/app.ts" />
<aura-route path="/map" view="iframe::https://maps.example.com/embed" />
```

#### `component` — валидация ref

`component` mount'ит **custom elements**, не произвольный HTML.

| Проверка | Поведение | Код |
|----------|-----------|-----|
| `customElements.get(ref)` есть | ✓ mount `<ref aura-data="…">` | ✅ `ComponentLoader` |
| ref без `-` | dev warn | ✅ при parse |
| CE не в registry | throw at load | ✅ `ComponentLoader` |

```html
view="component::user-card"   <!-- ✓ -->
view="component::div"         <!-- ✗ → html::<div>…</div> -->
```

#### `url` — ref и `extract` (partial vs full page)

`url` загружает **HTML с сервера** (не скрипты — для `.js`/`.ts` используйте `import`).

| `view` ref | Поведение |
|-----|-----------|
| `users.html` | ответ — готовый partial, вставляется as-is |
| `legacy/about.html` + `extract="#main"` | full HTML page → CSS selector → extract fragment |

```html
<aura-route path="/users" view="users.html" />
<aura-router extract="#main">
  <aura-route path="/about" view="legacy/about.html" />
</aura-router>
```

Правила парсинга `view`:

- Нет `::` → `url` + ref as-is (`users.html`).
- Перед первым `::` — **известный loader** (`html`, `template`, …) → `loader::content`.
- Иначе → **custom loader** (`markdown::doc.md`).
- Префикс `url::` допустим, но **не показываем в примерах** — избыточен для default.
- Неверное расширение (`.js`, `.ts`) → dev warn: use `import::…`.

**`extract`** — CSS selector для вырезки фрагмента из full page. Наследуется с `<aura-router>` / parent route; opt-out `extract=""`. Пусто → partial as-is.

Отдельный loader `doc` **не вводим** — extract через attr `extract`, не через грамматику `view`.

#### `iframe` — внешний URL во frame

```html
<aura-route path="/dashboard" view="iframe::https://vendor.example.com/embed" />
```

| | |
|--|--|
| **content** | абсолютный или относительный URL для `src` iframe |
| **Реализация** | `<iframe loading="lazy" …>`; sandbox/policy — на router (TBD) |
| **Статус** | ✅ builtin (`view-graph/loaders/iframe.ts`); sandbox/policy — ⬜ |

Имя **`iframe`**, не `embed` — сразу ясно без docs.

Кастомные loaders: `AuraRouter.registerLoader(loaderId, fn)` — любой `loaderId`, например `markdown::docs/guide.md`.

#### Миграция loader id (as-is → README) — ✅ runtime

| As-is (v2) | README / v3 | Статус |
|-------------|---------------|--------|
| `html-src` | **`url`** | ✅ `view-graph`; bare default → `url` |
| `html` | **`html`** | ✅ |
| `template` | **`template`** | ✅ |
| `component` | **`component`** | ✅ |
| `component-src` | **`import`** | ✅ |

Для nested shell — отдельно **`layout`** (только у parent-route без leaf-контента):

```html
<aura-route path="/users" layout="users-shell">
  <aura-route path=":id" view="user.html" />
</aura-route>
```

`source` + `data-content` удалены; миграция → `view`.

---

### Lifecycle

> Детали tiers: [LIFECYCLE_PHASE_NAMING.md](./LIFECYCLE_PHASE_NAMING.md)

#### Core (95% маршрутов)

```text
leave | guard | load | ready
```

| Attr | Когда | Blocking |
|------|-------|----------|
| **`leave`** | Перед уходом — «можно уйти?» | да |
| **`guard`** | Перед показом — auth, redirect | да |
| **`load`** | Данные до render | да |
| **`ready`** | После view commit — analytics, focus | нет |

```html
<aura-route
  path="/profile"
  view="profile.html"
  leave="confirm-unsaved"
  guard="auth"
  load="fetch-user"
  ready="analytics"
/>
```

#### Advanced

| Attr | Когда | Blocking |
|------|-------|----------|
| **`unmount`** | Cleanup exit-ветки после commit | нет |
| **`update`** | Тот же route, новый query/hash (shortcut) | нет |
| **`error`** | Сбой navigation / render (terminal) | — |

```html
<aura-router error="log-nav-error">
  <aura-route path="/search" update="sync-query" unmount="flush-cache" />
</aura-router>
```

#### Presentation (отдельная ось)

| Attr | Назначение |
|------|------------|
| **`transition-in`**, **`transition-out`** | Hook-имена анимации |
| **`transition-order`** | `out-in` \| `in-out` \| `parallel` |
| **`transition`** | Shortcut: `transition="fade"` → in + out |

#### Super advanced (`cache.dom`)

С `cache="dom"` или `cache="screen"` на route: **`detach`**, **`destroy`** (leave), **`restore`** (reattach из cache).  
Фаза 1: ✅ `ctx.teardown` / `ctx.restored` на `unmount` / `ready` (через pipeline + RouteDomCache); отдельные attrs — ⬜.

---

### Поведение: один атрибут вместо трёх (v2)

| Было (v2) | Стало (v3) |
|------|-------|
| `keep-alive` | **`cache="dom"`** или **`cache="screen"`** |
| `cache` (v2 data) | **`cache="data"`** |
| оба | **`cache="all"`** |

```html
<aura-route path="/editor" view="component::editor" cache="screen" />
<aura-route path="/feed" view="feed.html" cache="data" />
<aura-route path="/tabs/a" view="a.html" cache="dom" />
```

| `cache` | DOM (`RouteDomCache`) | Loader payload | Load hooks | Notes |
|---------|-----------------|----------------|------------|-------|
| `dom` | ✓ | | | |
| `view` | | ✓ | | |
| `data` | | | ✓ | |
| `screen` | ✓ | ✓ | | |
| `all` | ✓ | ✓ | ✓ | |
| `off` | | | | opt-out (overrides inherit) |
| *(absent)* | | | | inherits ancestor |
| `cache` / `cache=""` | ✓ | ✓ | | (= `screen`) |

Одна ось: *что сохраняем при уходе* — DOM, loader payload, load data или комбинация.

**Убрать с route:**

| Attr | Куда |
|------|------|
| `restore-scroll` | **удалён** → `scroll="restore"` на router, override на route |
| `loading-template`, `error-template` | default на router; route наследует и переопределяет |

> **`crossfade` / `data-crossfade` убраны из API.** Staged mount (два view root в outlet) включается через `transition` / `transition-order` на route или router — отдельного attr не нужно.

---

### Анимации

Большинство использует View Transitions API / CSS на outlet. Per-route анимации — редкость.

```html
<!-- router-level -->
<aura-router transition-order="out-in">

<!-- per-route только если нужно -->
<aura-route path="/hero" view="..." transition="fade" />
```

- `transition="fade"` → hook `fade` на in и out.
- Асимметрия: `transition="fade-out, slide-in"` или `transition-in` / `transition-out` attrs.

---

### Что остаётся на `<aura-router>`

```html
<aura-router
  guard="auth"
  ready="analytics"
  loading-template="loading"
  error-template="error"
  scroll="restore"
  transition-order="out-in"
>
```

| Attr на router | Зачем не на route |
|----------------|-------------------|
| `guard`, `ready` | глобальные defaults; route переопределяет |
| `loading-template`, `error-template` | один раз на приложение |
| `scroll`, `transition-order` | политика приложения |
| `error` | default для всего app |

```html
<aura-route path="/login" guard="" />  <!-- opt-out inherit -->
```

---

## Сравнение: было → стало

**Было (типичный «тяжёлый» route):**

```html
<aura-route
  path="/profile"
  source="html-src"
  data-content="profile.html"
  enter="auth"
  load="fetch-user"
  entered="analytics"
  leave="confirm"
  transition-in="fade-in"
  transition-out="fade-out"
  left="save-scroll"
  reenter="sync-query"
  error="log-error"
  keep-alive
  cache
/>
```

**Стало (README):**

```html
<aura-route
  path="/profile"
  view="profile.html"
  guard="auth"
  load="fetch-user"
  ready="analytics"
  leave="confirm"
  cache="all"
/>
```

Анимации — `transition` на router; `error` на router; `update` / `unmount` — только если нужны.

---

## Ментальная модель

```text
1. Куда?  → path
2. Что?   → layout | view (html | url | template | component | import | iframe)
3. Когда? → leave | guard | load | ready
4. Долго? → cache (+ detach/restore при dom keep-alive)
```

---

## Миграция (v2 → v3) — ✅ на `<aura-route>`

> v2 attrs **удалены** с элемента; таблица — для ручной миграции markup в существующих проектах.

### View / loaders

| v2 (удалено) | v3 (код) | Статус |
|-------------|----------|--------|
| `source` + `data-content` | `view="ref"` или `loader::content` | ✅ |
| loader `html-src` | **`url`** (bare content default) | ✅ runtime |
| loader `component-src` | **`import`** | ✅ runtime |
| loader `component` | **`component`** | ✅ |

### Lifecycle

| v2 (удалено) | v3 (код) | Статус |
|-------------|----------|--------|
| `enter` | **`guard`** | ✅ |
| `after` / `entered` | **`ready`** | ✅ |
| `left` | **`unmount`** | ✅ |
| `reenter` | **`update`** | ✅ |
| `leave`, `load`, `error` | без изменений | ✅ |

### Поведение

| v2 (удалено) | v3 (код) | Статус |
|-------------|----------|--------|
| `keep-alive` | `cache="dom"` / `cache="screen"` | ✅ |
| `cache` (v2) | `cache="data"` | ✅ |
| `restore-scroll` | `scroll` на router/route | ✅ |
| `transition-in` / `out` | `transition` или attrs `transition-*` | ✅ |

---

## Что сознательно не добавлять

| Идея | Почему нет |
|------|------------|
| `preload` на route | link intent + `router.prefetch()` — уже принятая стратегия |
| `keep-alive` / v2 `cache` как alias | breaking rename; v2 attrs удалены; v3 `cache` с режимами |
| `hooks` attr (`phase::hook`) | не актуально; per-phase attrs + `AuraRouter.use()` |
| `hooks="auth,analytics"` без фазы | магия: непонятно, когда сработает |
| `before` / `on` вместо `guard` / `ready` | целевые имена зафиксированы в [LIFECYCLE_PHASE_NAMING.md](./LIFECYCLE_PHASE_NAMING.md) |
| таймауты кэша в HTML | `router.configure({ dataCache: { gcTime } })` |

---

## Оценка: насколько улучшится легкость

### Сводка

| Метрика | Сейчас (v2 attrs) | После v3 | Δ |
|---------|-------------------|----------|---|
| Attrs в шпаргалке «запомни» | ~18 | ~7–8 | **−55%** |
| Attrs на типичном route (80%) | 5–7 | 3–4 | **−40%** |
| Attrs на «тяжёлом» route | 10–12 | 5–7 | **−45%** |
| Концепций кэша в голове | 2 (`keep-alive` + `cache`) | 1 attr `cache`, 3 слоя | **−50%** |
| Lifecycle attrs для 95% кейсов | 9 | 4 (`leave`, `guard`, `load`, `ready`) | **−55%** |
| Пар attrs «всегда вместе» | `source` + `content` | 0 | **−100%** |

**Оценка общего прироста лёгкости: ~40–50%** для новичка и ~**25–35%** для опытного пользователя, который уже знает pipeline.

Шкала (субъективная, для планирования):

| Область | Сейчас | После v3 | Комментарий |
|---------|--------|----------|-------------|
| Первый working route | 6/10 | **8.5/10** | `path` + `view` — сразу понятно |
| Onboarding / docs | 5/10 | **8/10** | три вопроса вместо девяти фаз |
| Ежедневная разметка | 6/10 | **8/10** | меньше шума в nested routes |
| Power-user сценарии | 8/10 | **8/10** | per-phase attrs + `AuraRouter.use()` |
| Миграция с v2 | — | 7/10 | ручной rename attrs |

### Почему не «10/10»

- Внутренний pipeline остаётся сложным — attrs только **маскируют**, не упрощают engine.
- `ready` + `ctx.phase` — единое имя post-commit (✅ attr `ready` в коде).
- bare `view="profile.html"`; fragment extract → **`extract`** attr
- Router inherit (`guard`, `ready`) — документировать opt-out `guard=""`.

### Где выигрыш максимальный

1. **Nested routes** — `layout` + короткий `view="child.html"`.
2. **CRUD** — `guard`, `load`, `ready` на большинстве страниц.
3. **Code review** — diff читается как куда / что / когда.

### Где выигрыш минимальный

1. Команды, которые уже вынесли всё в `AURARouter.use()` и почти не трогают phase attrs.
2. Сложные transition pipelines (GSAP) — programmatic API / `AuraRouter.use()`.
3. Миграция больших codebases — одноразовая стоимость.

### Сравнение с индустрией (лёгкость разметки)

| Router | Attrs / декларация route | После v3 aura |
|--------|--------------------------|---------------|
| Vue Router | JS-only (`routes[]`) | HTML-first остаётся USP; attrs сопоставимы по когнитивной нагрузке |
| TanStack Router | file-based + types | проще types, но хуже SSR-markup visibility |
| Navigo | `path` + hooks в JS | aura v3 ближе к «минимум в HTML» |

---

## Задачи реализации

> **✅ — готово** · **⬜ — осталось** · **🟡 — частично**  
> Сверка: **2026-07-10** · код: `src/modules/aura-route/`, `src/modules/aura-routing-engine/core/view-graph/`

### Фаза 1 — view + cache

- ✅ Парсер `view` → `parseViewAttr` → `resolvedView` → `ViewGraph.buildViewDescriptor`
- ✅ Loaders: `url`, `html`, `template`, `component`, `import`, `iframe` (`view-graph/registry.ts`)
- ✅ Парсер: known loader vs bare `url` ref; unknown prefix → custom loader
- ✅ Attr **`extract`** (CSS selector, inherit router → route) + `UrlLoader` fragment extract
- ✅ `component` validation — warn без `-` при parse; throw если CE не зарегистрирован
- ✅ Builtin **`iframe`** (`IframeLoader`)
- ✅ `cache` attr + wiring (`cache-attr-parser.ts`, `RouteDomCache` / `ViewPayloadCache` / `DataGraph`)
- ✅ Удалены v2 attrs: `source`, `data-content`, `keep-alive`, v2 `cache`

### Фаза 2 — lifecycle rename

- ✅ `guard`, `load`, `ready`, `leave`, `unmount`, `update`, `error` на `<aura-route>` (`aura-route.ts`)
- ✅ `phase-registry.ts` — v3 имена фаз и `htmlAttr`
- ✅ Router inherit: `guard`, `ready` — через `@routeAttr({ inherit: true })` + DOM `closest` (`lifecycle-inherit.test.ts`)
- ✅ `scroll`, `loading-template`, `error-template` inherit
- ✅ `transition` / `transition-order` / `transition-in` / `out` + shortcut

### Фаза 3 — polish

- ⬜ Attrs **`detach`**, **`destroy`**, **`restore`** (super advanced; сейчас — pipeline + `unmount` / `ready`)
- ⬜ `iframe` sandbox / CSP policy на router

### Миграция v2 → v3 (историческая справка)

| v2 (удалено) | v3 (в коде) |
|--------------|-------------|
| `enter` | `guard` |
| `after` / `entered` | `ready` |
| `left` | `unmount` |
| `reenter` | `update` |
| `keep-alive` | `cache="dom"` / `cache="screen"` |
| `cache` (v2) | `cache="data"` |
| `source` + `data-content` | `view` |

### Тесты (актуальные пути)

- ✅ `view` parser — `aura-route/test/attr/view-attr-parser.test.ts`
- ✅ descriptor / extract — `aura-routing-engine/test/view-graph/view-graph.test.ts`, `view-graph/loaders/url.test.ts`
- ✅ loaders — `view-graph/loaders/{html,component,import,iframe,template,url}.test.ts`
- ✅ `cache` — `aura-route/test/cache.test.ts`, `attr/cache-attr-parser.test.ts`
- ✅ inherit — `lifecycle-inherit.test.ts`, `extract-inherit.test.ts`, `template-inherit.test.ts`, `scroll-inherit.test.ts`
- ✅ transitions — `aura-route/test/aura-route.test.ts`, `attr/transition-*.test.ts`
- ✅ Pipeline phases v3 — `navigation-transaction-pipeline*.test.ts`, `param-change-lifecycle.test.ts`, `phase-registry.test.ts`

---

## Открытые вопросы

1. ~~**`url` vs `page`**~~ → ✅ **`url`** (default bare `view`).
2. ~~**`ready` vs `entered`**~~ → ✅ **`ready`** (attr + `phase-registry`).
3. ~~**`view` bare content**~~ → ✅ default **`url`**.
4. ~~**`allowEmpty`**~~ → ✅ `guard=""` / `ready=""` opt-out inherit (`lifecycle-inherit.test.ts`).
5. **`iframe` sandbox** — политика на router vs per-route.

---

## Ссылки

- Route attrs: `src/modules/aura-route/core/aura-route.ts`
- `view` parser: `src/modules/aura-route/core/attr/view-attr-parser.ts`
- Descriptor pipeline: `src/modules/aura-routing-engine/core/view-graph/view-graph.ts` (`buildViewDescriptor`)
- Loaders: `src/modules/aura-routing-engine/core/view-graph/loaders/`
- Lifecycle phases: `src/modules/aura-routing-engine/core/lifecycle/phase-registry.ts`
- Ранние идеи: `docs/scratch/aura-route-design-notes.js`, `aura-route-markup-examples.txt`

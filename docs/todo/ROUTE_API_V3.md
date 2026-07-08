# Route API v3 — путь к public API из README

> **Эталон:** [README.md](../../README.md) — единственный источник целевых имён и примеров.  
> **Этот документ:** зачем менять, as-is в коде → README, задачи реализации.  
> **Связь:** [LIFECYCLE_PHASE_NAMING.md](./LIFECYCLE_PHASE_NAMING.md) · [VIEW_LAYER_ARCHITECTURE.md](./VIEW_LAYER_ARCHITECTURE.md)

> **Не дублировать README как второй эталон.** Если расхождение — правим код / todo, README не трогаем без явного решения.

---

## Зачем

Сейчас на `<aura-route>` **~18 атрибутов** в трёх разных «языках». Разработчик открывает route и видит мини-справочник по движку, а не ответ на три вопроса: *куда, что, когда*.

| Группа | Текущие attrs | Проблема |
|--------|---------------|----------|
| Контент | `path`, `layout`, `source`, `content` | Два атрибута на одну мысль; `layout` и `content` взаимоисключающи, но выглядят равноправно |
| Lifecycle | `enter`, `load`, `entered`, `leave`, `left`, `reenter`, `transition-in`, `transition-out`, `error` | 9 фаз — нужно помнить порядок pipeline |
| Поведение | `keep-alive`, `cache` | Два вида кэша с неочевидными именами (`preserve` в v3) |
| Шаблоны | `loading-template`, `error-template` | Дублируют router; на route почти не нужны |

---

## Принципы v3

1. **80/20 в разметке** — 3–5 attrs на типичный route.
2. **Одна мысль — один attr** — `view="ref"` или `loader::ref`, не `source` + `data-content`.
3. **Lifecycle core-4** — `leave`, `guard`, `load`, `ready`; остальное advanced / presentation.
4. **Кэш и scroll — на router**, не на каждом route.
5. **Короткие имена** — без дефисов в loader id; без избыточного `url::` для default.

---

## Целевой API (из README)

Сводка — без дублирования таблиц; полный справочник в [README § `<aura-route>` attributes](../../README.md#aura-route-attributes).

```text
Route:        path | layout | view | preserve
View loaders: html | url | template | component | import | iframe
Lifecycle:    leave | guard | load | ready
Advanced:     unmount | update | error
Presentation: transition | transition-in | transition-out | transition-order
Preserve+:    detach | destroy | restore   (super advanced, с preserve)
```

---
### Ядро (почти всегда)

```html
<aura-route path="/profile" view="component::profile-page" />
```

| Атрибут | Назначение |
|---------|------------|
| **`path`** | URL-паттерн (обязательный) |
| **`view`** | Контент: bare `ref` (default `url`) или `loader::ref` |

Формат: bare **`ref`** → loader **`url`**. Иначе `loader::ref` (`::` — разделитель). Селектор фрагмента — отдельный attr **`extract`**, не в `view`.

### View loaders → README

> **As-is в коде:** loader id `html-src`, `component-src`; attrs `source` + `data-content`. **Цель:** как в README.

| Loader (README) | ref | As-is в коде |
|--------|-----|--------------|
| **`url`** | `profile.html` | loader `html-src`; bare ref пока default `html-src` |
| **`html`** | markup | `html` |
| **`template`** | template id | `template` |
| **`component`** | CE tag name | loader `component` (имя в README = имя в API) |
| **`import`** | module path | loader `component-src` |
| **`iframe`** | URL | planned |

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

#### `component` — валидация ref (planned)

`component` mount'ит **custom elements**, не произвольный HTML.

| Проверка | Поведение |
|----------|-----------|
| `customElements.get(ref)` есть | ✓ mount `<ref aura-data="…">` |
| ref содержит `-` | ✓ допустимо до `define` |
| ref — нативный тег (`div`, …) | ✗ warn: use `html` |

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
- Перед первым `::` — **известный loader** (`html`, `template`, …) → `loader::ref`.
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
| **ref** | абсолютный или относительный URL для `src` iframe |
| **Реализация** | `<iframe loading="lazy" …>`; sandbox/policy — на router (TBD) |
| **Статус** | planned builtin (после rename `url` / `import`) |

Имя **`iframe`**, не `embed` — сразу ясно без docs.

Кастомные loaders: `AuraRouter.registerLoader(type, fn)` — любой `type`, например `markdown::docs/guide.md`.

#### Миграция loader id (as-is → README)

| As-is (код) | README / цель | Примечание |
|-------------|---------------|------------|
| `html-src` | **`url`** | + bare ref default → `url` |
| `html` | **`html`** | без изменений |
| `template` | **`template`** | без изменений |
| `component` | **`component`** | **имя не меняем** |
| `component-src` | **`import`** | rename loader id |

Deprecated alias на переход: `html-src`, `component-src` + dev warn.

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

#### Super advanced (`preserve`)

С `preserve` на route: **`detach`**, **`destroy`** (leave), **`restore`** (reattach из cache).  
Фаза 1: `ctx.teardown` / `ctx.restored` на `unmount` / `ready`; отдельные attrs — позже.

#### Escape hatch `hooks`

Редкие фазы одним attr (comma-separated `phase::hook`):

```html
hooks="transition-in::fade-in, detach::pause-media"
```

Не заменяет core-4; для фаз вне типичного route.

---

### Поведение: один атрибут вместо трёх

| Было | Стало |
|------|-------|
| `keep-alive` | **`preserve`** |
| `cache` | **`preserve="data"`** |
| оба | **`preserve="all"`** |

```html
<aura-route path="/editor" view="component::editor" preserve />
<aura-route path="/feed" view="feed.html" preserve="data" />
```

Одна ось: *что сохраняем при уходе* — DOM, payload или всё.

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
- Асимметрия: `transition="fade-out, slide-in"` или `hooks="transition-in::..., transition-out::..."`.

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
  preserve="all"
/>
```

Анимации — `transition` на router; `error` на router; `update` / `unmount` — только если нужны.

---

## Ментальная модель

```text
1. Куда?  → path
2. Что?   → layout | view (html | url | template | component | import | iframe)
3. Когда? → leave | guard | load | ready
4. Долго? → preserve (+ detach/restore при keep-alive)
```

---

## Миграция (as-is в коде → README)

### View / loaders

| As-is (код) | README |
|-------------|--------|
| `source` + `data-content` | `view="ref"` или `loader::ref` |
| loader `html-src` | **`url`** (bare ref default) |
| loader `component-src` | **`import`** |
| loader `component` | **`component`** (без rename) |

### Lifecycle

| As-is (код) | README |
|-------------|--------|
| `enter` | **`guard`** |
| `after` / `entered` | **`ready`** |
| `left` | **`unmount`** |
| `reenter` | **`update`** |
| `leave`, `load`, `error` | без изменений |

### Поведение

| As-is | README |
|-------|--------|
| `keep-alive` | `preserve` |
| `cache` | `preserve="data"` |
| `restore-scroll` | `scroll` на router/route |
| `transition-in` / `out` | `transition` или attrs `transition-*` |

Deprecated aliases на переход: `html-src`, `component-src`, `enter`, `after`, `left`, `reenter`, `keep-alive`, `cache` + dev warn.

---

## Что сознательно не добавлять

| Идея | Почему нет |
|------|------------|
| `preload` на route | link intent + `router.prefetch()` — уже принятая стратегия |
| `keep-alive` / `cache` как alias для `preserve` | breaking rename проще; два имени на одну ось — лишний шум |
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
| Концепций кэша в голове | 2 (`keep-alive` + `cache`) | 1 (`preserve`) | **−50%** |
| Lifecycle attrs для 95% кейсов | 9 | 4 (`leave`, `guard`, `load`, `ready`) | **−55%** |
| Пар attrs «всегда вместе» | `source` + `content` | 0 | **−100%** |

**Оценка общего прироста лёгкости: ~40–50%** для новичка и ~**25–35%** для опытного пользователя, который уже знает pipeline.

Шкала (субъективная, для планирования):

| Область | Сейчас | После v3 | Комментарий |
|---------|--------|----------|-------------|
| Первый working route | 6/10 | **8.5/10** | `path` + `view` — сразу понятно |
| Onboarding / docs | 5/10 | **8/10** | три вопроса вместо девяти фаз |
| Ежедневная разметка | 6/10 | **8/10** | меньше шума в nested routes |
| Power-user сценарии | 8/10 | **8/10** | `hooks="phase::name"` сохраняет контроль |
| Миграция с v2 | — | 7/10 | ручной rename attrs; alias-слой не планируется |

### Почему не «10/10»

- Внутренний pipeline остаётся сложным — attrs только **маскируют**, не упрощают engine.
- `ready` + `ctx.phase` — единое имя post-commit (as-is в коде: `after`).
- bare `view="profile.html"`; fragment extract → **`extract`** attr
- Router inherit (`guard`, `ready`) — документировать opt-out `guard=""`.

### Где выигрыш максимальный

1. **Nested routes** — `layout` + короткий `view="child.html"`.
2. **CRUD** — `guard`, `load`, `ready` на большинстве страниц.
3. **Code review** — diff читается как куда / что / когда.

### Где выигрыш минимальный

1. Команды, которые уже вынесли всё в `AURARouter.use()` и почти не трогают phase attrs.
2. Сложные transition pipelines (GSAP) — всё равно нужен `hooks` или programmatic API.
3. Миграция больших codebases — одноразовая стоимость.

### Сравнение с индустрией (лёгкость разметки)

| Router | Attrs / декларация route | После v3 aura |
|--------|--------------------------|---------------|
| Vue Router | JS-only (`routes[]`) | HTML-first остаётся USP; attrs сопоставимы по когнитивной нагрузке |
| TanStack Router | file-based + types | проще types, но хуже SSR-markup visibility |
| Navigo | `path` + hooks в JS | aura v3 ближе к «минимум в HTML» |

---

## Задачи реализации

> **✅ — готово** · **⬜ — осталось**

### Фаза 1 — view + preserve

- ✅ Парсер `view` → `buildContentDescriptor`
- ✅ Loaders: `url`, `import`, `iframe`; bare ref default `url`
- ✅ Парсер: known loader vs bare `url` ref; unknown prefix → custom loader
- ✅ Attr **`extract`** (CSS selector, inherit router → route) + url loader fragment extract
- ⬜ `component` validation (registry / `-`; reject native tags)

- ⬜ Builtin `iframe`
- ✅ `preserve` attr + wiring

### Фаза 2 — lifecycle rename (as-is → README)

- ⬜ `enter` → **`guard`**, `after` → **`ready`**
- ⬜ `left` → **`unmount`**, `reenter` → **`update`**
- ⬜ Router inherit: `guard`, `ready` (as-is: `enter`, `after`)
- ✅ `scroll`, `loading-template`, `error-template` inherit
- ✅ `transition` / `transition-order` / `transition-in` / `out`


- ✅ `transition` shortcut

### Уже в коде под старыми именами

| Реализовано | As-is | README |
|-------------|-------|--------|
| post-commit enter hook | `after` | `ready` |
| enter guard | `enter` | `guard` |
| exit cleanup | `left` | `unmount` |
| same-route shortcut | `reenter` | `update` |

### Тесты

- ✅ `view` / descriptor — `descriptor.test.ts`, `view-attr-integration.test.ts`, `content-view-flow.test.ts`
- ✅ `preserve` parsing — `preserve.test.ts` (engine + route-2)
- ✅ `hooks` + `routeHookNames` — `phase-hooks.test.ts`
- ✅ Pipeline phases (as-is names): `after`, `left`, `reenter`
- ✅ Inherit router → route (`enter` / `after` as-is → migrate to `guard` / `ready`)

---

## Открытые вопросы

1. **`url` vs `page`** — имя default HTML loader (см. обсуждение в todo).
2. **`ready` vs `entered`** — target: `ready` (as-is attr: `after`).
3. ~~**`view` bare ref**~~ → default **`url`**.
4. ~~**`allowEmpty`**~~ → `guard=""` / `ready=""` opt-out inherit.

---

## Ссылки

- Текущая реализация attrs: `src/modules/aura-route-2/core/aura-route.ts`
- Descriptor: `src/modules/aura-routing-engine/core/content/descriptor.ts`
- Ранние идеи: `docs/scratch/aura-route-design-notes.js`, `aura-route-markup-examples.txt`

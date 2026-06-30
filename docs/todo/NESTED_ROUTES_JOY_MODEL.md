# Nested routes: модель «радости» (Route Folders)

> **Статус:** vision / proposal (2026-06-27), **согласован с** [ROUTE_API_V3.md](./ROUTE_API_V3.md)  
> **Контекст:** как nested должны ощущаться через 5 лет — легко и интуитивно  
> **Область:** nested-специфика поверх v3 attrs; attrs и lifecycle — **из v3, не дублируем**  
> **Связь:** [NESTED_ROUTES.md](../NESTED_ROUTES.md) · [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md)

---

## TL;DR

**Route Folders** — mental model для nested: URL = папки, children = файлы внутри.

Public API nested строится на **Route API v3**:

```text
1. Куда?  → path (+ relative внутри папки)
2. Что?   → view (Page) | shell + outlet (Folder: colocated `<template>` или `layout`)
3. Когда? → enter | leave | load | after  (+ inherit с router и folder)
```

Дополнительно для nested (этот документ):

1. **Folder route** = shell + children + outlet — colocated `<template>` или `layout="id"`  
2. **Page route** = короткий `view` в outlet родительской папки  
3. **Paths** = относительные имена внутри папки  
4. **Hooks** = inherit с `<aura-router>` и folder; opt-out через `enter=""`  
5. **Links** = relative by default, active state бесплатно  

Engine (LCA, `enterRoutes`, outlet chain) **не ломаем** — меняем только DX поверх v3.

---

## Согласование с Route API v3

| Тема | v3 (реализуется) | Этот документ (nested-слой) |
|------|------------------|----------------------------|
| Контент leaf | `view="html-src:profile.html"` | то же; короткий attr внутри folder |
| Folder shell | `layout` + template | colocated `<template data-route-shell>` **или** external `layout` |
| Lifecycle | `enter` · `leave` · `load` · `after` | inherit вниз по дереву |
| Post-commit | `after` + `ctx.phase` | analytics/scroll на folder или router |
| Кэш DOM | `preserve` / `preserve="data"` | folder shell: `preserve`; leaf: по необходимости |
| Глобальные defaults | `enter`, `after` на `<aura-router>` | auth один раз на router или folder |
| Анимации | `data-transition` на router, `transition` на route | sibling swap — outlet child, shell не трогаем |
| Escape hatch | `hooks="phase:hook-name"` | редкие asymmetric transitions |
| Deprecated | `source`+`content`, `entered`/`left`/`reenter`, `keep-alive` | в nested-примерах **не используем** |

**Не входит в v3 attrs** (nested RFC, реализуется отдельно):

- `data-route-shell` / `data-route-outlet` — shell в `<template>` внутри folder (браузер не рисует до JS)
- `aura-route-fragment` / CMS partials
- relative `data-router-link`, `data-branch-active`, breadcrumbs CE

---

## Зачем Route Folders

Nested в v3 уже проще (`layout` + короткий `view` на child), но разработчику всё ещё нужна **одна метафора**:

```text
/settings/           ← папка (layout shell)
  profile            ← страница (view)
  security           ← страница (view)
```

Термины parent/child/outlet/LCA — engine; в docs и onboarding — **папки и страницы**.

---

## Три типа route

| Тип | Разметка v3 | Пример URL |
|-----|-------------|------------|
| **Page** | `path` + `view`, без children | `/about` |
| **Folder** | children + shell (`layout` или inline) | `/settings/*` |
| **Redirect** | `redirect="..."` (planned) | `/settings` → `/settings/profile` |

Router определяет тип по DOM: `redirect` → Redirect; nested `<aura-route>` → Folder; иначе → Page.

### Redirect (кратко)

URL без UI — сразу другой адрес. Статический alias в разметке; условный (auth, role) — `enter` hook.

```html
<aura-route path="/settings" redirect="/settings/profile"/>
<aura-route path="/app" layout="app-shell">
  <aura-route path="." redirect="dashboard"/>
  <aura-route path="dashboard" view="html-src:dashboard.html"/>
</aura-route>
```

| | `redirect` attr | Index Page (`path="."`) |
|--|-----------------|-------------------------|
| URL folder | уходит на target | показывает overview |
| UI | нет | есть |

Relative target (`redirect="dashboard"`) резолвится от parent path. Синхронные цепочки — см. [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md).

| Статический alias | Условный (auth, role) |
|-------------------|------------------------|
| `redirect="..."` | `enter` hook → `return '/path'` |

### Page (кратко)

Leaf без nested `<aura-route>`. Показывает `view` при каждом входе на URL.

| Где | Mount |
|-----|-------|
| Root (рядом с router) | root `<aura-outlet>` |
| Внутри folder | nested outlet (`data-route-outlet` / `<aura-outlet>` в shell) |

```html
<aura-route path="/about" view="html-src:about.html"/>
<!-- в folder -->
<aura-route path="profile" view="html-src:profile.html" load="fetch-user"/>
```

Index Page — `path="."` внутри folder; URL = URL folder, контент в outlet (не Redirect).

Inline HTML без `view` (raw children) — RFC; v3 canonical: `view="html:…"`.

### Folder: выбор разметки

```text
Нужен общий shell для нескольких URL?
  ├─ один раздел, colocated в одном файле → `<template data-route-shell>` внутри folder
  └─ shared template / CMS               → layout="template-id"

URL folder без суффикса (/settings)?
  ├─ overview на месте      → index Page (path=".")
  └─ всегда default tab     → Redirect
```

---

## Folder route (v3)

### Shared shell: `layout` + template

```html
<template id="settings-shell">
  <header>
    <h1>Settings</h1>
    <nav>
      <a href="profile" data-router-link>Profile</a>
      <a href="security" data-router-link>Security</a>
    </nav>
  </header>
  <main><aura-outlet/></main>
</template>

<aura-route path="/settings" layout="settings-shell" enter="auth">
  <aura-route path="profile" view="html-src:profile.html"/>
  <aura-route path="security" view="html-src:security.html"/>
</aura-route>
```

| Правило | Поведение |
|---------|-----------|
| Folder имеет `layout` | shell монтируется один раз при входе в ветку |
| В template — `<aura-outlet>` | child `view` рендерится в nested slot |
| Нет outlet в template | dev warn с подсказкой |
| Sibling nav | только child в `enterRoutes`; shell стабилен |

Shared layout между разделами — один `<template id="...">`, несколько folder routes.

### Inline shell (colocated, но **inert**)

**Проблема наивного inline:** если shell в **light DOM** `<aura-route>` как обычный HTML, браузер покажет его **сразу при загрузке** — до router, и **все folder сразу** (sidebar от `/app`, `/admin`, … одновременно). Плюс:

| Риск | Что происходит |
|------|----------------|
| Flash | пользователь видит чужой nav / пустой outlet |
| SEO | краулер индексирует **все** секции, дубли nav, контент вне контекста URL |
| a11y | лишние ссылки и landmarks в DOM |

`<aura-route>` по архитектуре — **metadata**, visible UI только в **outlet** ([OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md)). Inline shell = «разметка рядом с route», не «рисуем внутри CE».

**Контракт inline (обязательный):**

```text
1. Shell хранится inert — не в отрисовываемом light DOM route
2. При enter folder — clone → mount в outlet (как layout template)
3. `<aura-route>` и nested route children — hidden от пользователя
```

**Colocated вариант (рекомендуемый inline):** `<template>` **внутри** folder — один файл, но inert, как external `layout`:

```html
<aura-route path="/app" preserve>
  <template data-route-shell>
    <aside>
      <a href="dashboard" data-router-link>Dashboard</a>
      <a href="settings" data-router-link>Settings</a>
    </aside>
    <section data-route-outlet></section>
  </template>

  <aura-route path="dashboard" view="html-src:dashboard.html"/>
  <aura-route path="settings" view="html-src:settings.html"/>
</aura-route>
```

| | Colocated `<template>` (inert) | Shell в light DOM `<aura-route>` |
|--|--------------------------------|-----------------------------------|
| **До загрузки JS** | Пользователь видит только пустой root `<aura-outlet>`; sidebar в `<template>` **не отображается** | Sidebar и outlet **сразу на экране** у всех разделов сразу |
| **SEO без SSR** | В `index.html` для краулера: пустой outlet + скрытые `<template>` (не страница). Осмысленный текст — только после JS | Весь nav всех разделов **в открытом HTML** — дубли, лишние ссылки, не тот URL |
| **Разметка в одном месте** | Shell (`<template>`), outlet и `<aura-route>` children — **внутри одного** `<aura-route path="/app">`, без отдельного `<template id="…">` внизу файла | Тоже в одном блоке, но shell **не inert** — отсюда flash и SEO-проблемы |
| **Engine** | Тот же clone в outlet, что у `layout="template-id"` | Отдельный путь; shell нельзя просто спрятать в `<template>` |

> **Inert** — разметка лежит в HTML-файле, но браузер **не показывает** её на экране (`<template>` не рисуется сам по себе). Router копирует её в outlet после загрузки JS.

**SSR:** сервер вставляет в `<aura-outlet>` **готовый HTML текущей страницы** (shell + контент для этого URL). Определения маршрутов (`<aura-route>`, `<template>`) остаются скрытыми — в выдаче один осмысленный документ, не все разделы сразу.

> **CSR** (client-side rendering) — браузер получает «пустой» HTML, контент появляется **после** загрузки JS. **SSR** — сервер сразу отдаёт готовую разметку страницы в HTML.

**Getting Started vs production:**

| Сценарий | Рекомендация |
|----------|--------------|
| Обучение, один folder | colocated `<template data-route-shell>` |
| Shared shell, CMS | `layout="template-id"` |
| Сайт, где важен Google / первый экран | **Одного «JS рисует всё» мало:** сервер должен отдать готовый HTML в outlet (**SSR**), иначе до загрузки скриптов — пустая страница. Либо skeleton на router |

```html
<!-- ❌ не так: shell виден до router и при всех routes -->
<aura-route path="/app">
  <aside data-route-shell>...</aside>
  ...
</aura-route>
```

Нет outlet при children → dev warn. Нет index/redirect на folder URL → nested 404 в outlet (planned) или явный Redirect.

Engine: colocated shell → clone `<template data-route-shell>`; `findNestedOutlet()` — prefer `<aura-outlet>`, иначе upgrade `[data-route-outlet]` → outlet binding.

| | Colocated `<template>` | `layout="template-id"` |
|--|------------------------|------------------------|
| Файл | shell внутри `<aura-route>` | shell отдельно |
| Shared shell | extract template наружу | один id, N folders |
| Inert / SEO-safe | да | да |
| v3 attrs | `enter`, `preserve` | `layout`, `enter`, `preserve` |

UA default: `aura-route { display: none }` — route CE и nested route children не в accessibility tree до mount в outlet.

### Вложенные folders

Folder внутри folder — цепочка shells и outlets:

```html
<aura-route path="/admin" layout="admin-shell" enter="auth">
  <aura-route path="users" layout="users-shell">
    <aura-route path="." view="html-src:users-list.html"/>
    <aura-route path=":id" view="html-src:user-detail.html"/>
  </aura-route>
</aura-route>
<!-- /admin/users/42 → admin-shell → users-shell → page -->
```

### Index child

```html
<aura-route path="/dashboard" layout="app-shell">
  <aura-route path="." view="html-src:overview.html"/>
  <aura-route path="users" view="html-src:users.html"/>
</aura-route>
```

Canonical: **`path="."`** (не пустой `path=""`).

Inline folder:

```html
<aura-route path="/dashboard" preserve>
  <template data-route-shell>
    <nav>...</nav>
    <main data-route-outlet></main>
  </template>
  <aura-route path="." view="html-src:overview.html"/>
  <aura-route path="users" view="html-src:users.html"/>
</aura-route>
```

---

## Paths: как в файловой системе

> Внутри папки — имя файла. Полный path — только если route **вне** folder в DOM.

```html
<!-- ✅ -->
<aura-route path="/settings" layout="settings-shell">
  <aura-route path="profile" view="html-src:profile.html"/>
</aura-route>

<!-- ⚠️ dev: "profile уже под /settings" -->
<aura-route path="/settings/profile" view="html-src:profile.html"/>
```

---

## Lifecycle и inherit (v3 + nested)

### Четыре слота на route

| Attr | Когда | Nested note |
|------|-------|-------------|
| `enter` | guard до активации | folder `enter="auth"` → все children |
| `leave` | guard до ухода | child leave при sibling swap; folder leave при выходе из ветки |
| `load` | данные до render | parallel на `enterRoutes` (engine) |
| `after` | post-commit | `ctx.phase`: `entered` \| `reenter` \| `left` |

Hook в `after` не нужно дублировать на каждый child, если достаточно router default.

### Inherit: router → folder → page

```html
<aura-router enter="auth" after="analytics">
  <aura-outlet/>

  <aura-route path="/login" view="html-src:login.html" enter=""/>

  <aura-route path="/app" layout="app-shell">
    <aura-route path="dashboard" view="html-src:dashboard.html"/>
    <!-- inherit: enter=auth, after=analytics -->
    <aura-route path="public" view="html-src:public.html" enter=""/>
  </aura-route>
</aura-router>
```

| Механизм | Поведение |
|----------|-----------|
| Attr на `<aura-router>` | defaults для всего дерева |
| Attr на folder | merge с router (hook lists concat, если не override) |
| Child переопределяет attr | заменяет унаследованное значение целиком |
| `enter=""` / `leave=""` / … | opt-out inherited для **этого** слота на node |

Отдельный attr `isolated` **не нужен** — v3 решает через пустой `enter=""` и override.

### UX-слой для onboarding (не attrs)

Pipeline по-прежнему детальный; в docs для app-dev — три слова:

```text
Leaving…  →  Loading…  →  Ready
     ↑            ↑           ↑
  leave        load      after (entered)
```

При sibling nav: shell folder не мигает; Loading/Ready только на outlet child.

---

## Router defaults (v3)

```html
<aura-router
  enter="auth"
  after="analytics"
  loading-template="loading"
  error-template="error"
  data-transition="out-in"
  scroll="restore"
>
  <aura-outlet/>
  <!-- folder + page routes -->
</aura-router>
```

| На router | Зачем не на каждом route |
|-----------|--------------------------|
| `enter`, `after` | один раз auth/analytics |
| `loading-template`, `error-template` | inherit; nested error в child outlet |
| `data-transition` | политика outlet |
| `scroll` | `restore` \| `top` \| `manual` |

Folder route переопределяет только отличия; leaf — минимум attrs:

```html
<aura-route path="profile" view="html-src:profile.html" load="fetch-user"/>
```

---

## `preserve` в nested

| Route | Рекомендация |
|-------|--------------|
| Folder shell | `preserve` — sidebar не пересоздавать при sibling nav |
| Leaf с формой | `preserve` или `preserve="all"` |
| Leaf feed/list | `preserve="data"` |

```html
<aura-route path="/app" layout="app-shell" preserve>
  <aura-route path="editor" view="component:editor" preserve="all"/>
</aura-route>
```

---

## Outlet и nested «прозрачность»

```html
<aura-router>
  <aura-outlet/>   <!-- root — единственный обязательный в Getting Started -->
  ...
</aura-router>
```

Nested outlet — **в shell folder** (`data-route-outlet`, `<aura-outlet>` в template или inline). Не отдельная концепция в Getting Started.

Контент child — как `<slot>` для навигации: root Page → root outlet; nested Page → outlet folder.

---

## Ссылки (nested RFC, поверх v3)

```html
<!-- Внутри /settings/profile -->
<a href="security" data-router-link>Security</a>
<a href="../users" data-router-link>Users</a>
<a href="/" data-router-link>Home</a>
```

| Фича | Статус |
|------|--------|
| Relative href от текущей folder | planned (link resolver) |
| `data-router-active-class` | planned — active на self |
| `data-branch-active` на folder | planned — active если любой child active |
| `<aura-breadcrumbs/>` / `router.trail` | planned — zero config из дерева |

---

## Ошибки как наставник

```text
❌ Route "profile" uses relative path but is not nested in a folder.
   Nest inside: <aura-route path="/settings"> …

❌ Folder "/settings" has children but no outlet.
   Add: <section data-route-outlet></section> or <aura-outlet> in shell/template

✓ /settings/profile → /settings/security
  Keeping: settings shell (inline or layout)
  Swapping: profile → security in outlet
```

Dev overlay: дерево, active branch, resolved paths.

---

## CMS и split HTML (RFC)

```html
<aura-route-fragment for="/settings">
  <aura-route path="profile" view="html-src:profile.html"/>
  <aura-route path="security" view="html-src:security.html"/>
</aura-route-fragment>
```

Не входит в v3; под капотом — `aura-route-group`.

---

## Минимальный первый опыт (colocated template)

```html
<aura-router enter="auth" after="analytics">
  <aura-outlet/>

  <aura-route path="/" view="html:<h1>Home</h1>"/>

  <aura-route path="/app" preserve>
    <template data-route-shell>
      <aside>
        <a href="dashboard" data-router-link>Dashboard</a>
        <a href="settings" data-router-link>Settings</a>
      </aside>
      <section data-route-outlet></section>
    </template>
    <aura-route path="dashboard" view="html-src:dashboard.html"/>
    <aura-route path="settings" view="html-src:settings.html"/>
  </aura-route>

  <aura-route path="/login" view="html-src:login.html" enter=""/>
</aura-router>
```

Тот же сценарий с shared `layout="app-shell"` — см. [Shared shell: layout + template](#shared-shell-layout--template).

---

## Mapping на engine

| Public (v3 + nested) | Engine |
|----------------------|--------|
| Folder `layout` | `viewKind: 'layout'` → template → `findNestedOutlet()` |
| Inline shell | `viewKind: 'layout'` из `<template data-route-shell>`; clone → outlet |
| Leaf `view` | `buildContentDescriptor(view)` → mount в parent outlet |
| Router/folder inherit | merge attrs при `collectRoutes()` / hook runner |
| `enter=""` | skip inherited `enter` для node |
| `preserve` | view cache + skip re-render на sibling nav |
| Relative paths | `resolvePattern(parent, child)` (как сейчас) |
| `path="."` | index child → parent URL |
| `redirect` | match → navigate target без render |
| Relative links / branch-active | link resolver + active chain (planned) |

---

## Что сознательно не в default API

| Фича | Почему |
|------|--------|
| Named / parallel outlets | modals → portal / отдельный CE |
| `preload` на route | link intent + `router.prefetch()` (v3) |
| Param inheritance на folder | params на leaf |
| 9 phase attrs на route | v3: 4 слота + `hooks` escape |

**Антипаттерны:** folder с children без shell/outlet; `layout` на leaf без children; absolute path на child уже внутри folder.

---

## Аудит: известные дыры и контракты

Проверка proposal на противоречия, SEO, SSR, inherit и edge cases. **P0** — закрыть до реализации; **P1/P2** — RFC или docs.

### P0 — ломают модель, если не зафиксировать

| # | Дыра | Контракт / mitigation |
|---|------|------------------------|
| 1 | **Light DOM shell** в `<aura-route>` | Запрет + dev error. Только inert: external `layout`, colocated `<template>`. |
| 2 | **`data-route-outlet` ≠ `<aura-outlet>`** | Plain `<section data-route-outlet>` не CE — при clone engine **создаёт или биндит** `AuraOutlet` на marker. Иначе patch/stage не работают. Canonical в shell: `<aura-outlet>`. |
| 3 | **CSR без SSR: пустая страница до JS** | Пользователь видит пустой `<aura-outlet>`; shell в `<template>` не показывается. Нужен skeleton на router или SSR. SEO без SSR — слабый контент в index. |
| 4 | **Тип route: конфликтующие attrs** | `redirect` + children → dev error. `view` + children (folder) → dev error (`view` только на Page). `layout` + `redirect` на одном node → error. |
| 5 | **`layout` + `<template data-route-shell>`** на одном folder | Dev error: выбрать один источник shell. Приоритет не нужен — mutually exclusive. |
| 6 | **Folder без shell** (children есть, нет layout/template) | Dev error at `collectRoutes()`, не runtime 404. |
| 7 | **Inherit: merge semantics** | Явно: router defaults → folder override/add → child override. **Concat** для hook lists (`enter="auth"` router + `enter="analytics"` folder → оба на subtree), если child не переопределил целиком. `enter=""` = opt-out **всех** inherited `enter` на node. То же для `leave` / `load` / `after`. |
| 8 | **Top-level Redirect vs Folder** | `path="/settings" redirect="…"` **без shell** — это Redirect, не Folder. Shell на `/settings` + default tab → Folder + index Redirect child (`path="."`). |

### P1 — UX / SEO / hydration

| # | Дыра | Контракт / mitigation |
|---|------|------------------------|
| 9 | **`<template>` в HTML source (CSR)** | Inert для render, но текст/ссылки **в исходнике** страницы. Краулер может видеть дубли nav. Mitigation: SSR active branch; или shell вынести в external chunk; не light DOM. |
| 10 | **Hydration mismatch (SSR)** | Сервер: outlet = shell + page. Клиент: не re-clone shell если markup совпадает — **hydrate** outlet, не replace. Иначе flash + double mount. |
| 11 | **`data-router-link` в shell до mount** | Ссылки в template inactive до clone. Делегирование на `aura-router` после mount; до первого enter — обычные `<a href>` с **resolved absolute** href для noscript/SEO. Relative links — после link resolver (planned). |
| 12 | **Scroll `restore` nested** | Scroll scope: **leaf outlet** по умолчанию; shell scroll отдельно (`preserve` shell). `scroll="restore"` на router + key = `viewCacheKey` per leaf. |
| 13 | **Loading / error scope** | Первый enter folder+child: loading в **child outlet**; shell уже виден. Error в child — **не** снимает parent shell. Error при mount shell — fail всей ветки. |
| 14 | **`preserve` + exit/re-enter ветки** | Exit branch → stash shell handle по folder cache key. Re-enter → restore, не re-clone template. Sibling nav → skip render (LCA), не путать с re-enter. |
| 15 | **Transitions** | `data-transition` на router: по умолчанию animate **leaf outlet** only; shell вне transition. Override: `transition` на route или `hooks`. |

### P2 — edge cases, позже

| # | Дыра | Контракт / mitigation |
|---|------|------------------------|
| 16 | **Несколько outlet markers** в shell | Dev error: ровно один `[data-route-outlet]` или `<aura-outlet>`. Named outlets — v0.3+. |
| 17 | **Вложенные folders + preserve** | Каждый folder level — свой shell handle и nested outlet; preserve per level. |
| 18 | **`aura-route-fragment`** | Children вне DOM folder — paths **absolute** или `for=` задаёт base; folder-relative не работает без anchor. |
| 19 | **`path="."` vs engine `""`** | Alias при collect: `"."` → index child (как `""` сегодня). Одна canonical форма в docs: `"."`. |
| 20 | **Catch-all / 404 в folder** | `/settings/*` → parent shell + `error-template` / catch-all Page в outlet. Global `*` — отдельно. |
| 21 | **Deep link auth** | Cold enter: folder `enter` → child `enter` (serial). Sibling: только child hooks. Inherit не должен re-run parent `enter`. |
| 22 | **noscript** | Без JS: `<a href>` с absolute URLs в shell (resolved at build/SSR). Router-enhanced nav — progressive enhancement. |

### Противоречия в proposal (исправлено в этом доке)

| Было | Стало |
|------|-------|
| «inline shell» = light DOM в route | inline = **colocated inert `<template>`** only |
| Folder без `layout` attr в colocated примере | engine определяет shell по `data-route-shell`, не по attr `layout` |
| `enter=""` только для auth opt-out | opt-out для любого inherited slot; документировать `leave=""` и т.д. |
| Relative links в примерах без resolver | planned; в shell до resolver — absolute href или build-time resolve |

### Decision tree (valid route node)

```text
<aura-route>
  redirect?           → Redirect (no children, no view, no layout)
  nested <aura-route>? → Folder (require layout OR data-route-shell template)
  else                → Page (require view, no layout)
```

---

## Open questions

1. **Hydration** — атрибуты/markers на server-rendered outlet vs client clone (см. аудит §10)
2. **Nested 404** — catch-all Page vs `error-template` в child outlet
3. **`path="."` engine alias** — маппинг на существующий index `""`
4. **Template в HTML source vs SEO** — нужен ли build-time strip для CSR-only (см. аудит §9)

Вопросы v3:

- Пустой `enter=""` vs отсутствие attr — см. [ROUTE_API_V3.md §Открытые вопросы](./ROUTE_API_V3.md#открытые-вопросы)
- `after` + blocking semantics для `left` phase

---

## Сравнение: v2 design → v3 + Route Folders

| Аспект | v2 / старый design | v3 + Route Folders |
|--------|-------------------|-------------------|
| Leaf content | `source` + `content` | `view="html-src:…"` |
| Folder shell | `layout` + template | colocated `<template>` или external `layout` |
| Lifecycle | 9 attrs | 4: `enter` `leave` `load` `after` |
| Inherit | `inherit-hooks` (planned) | router/folder defaults + `enter=""` opt-out |
| Кэш | `keep-alive` + `cache` | `preserve` |
| Mental model | parent/child/outlet | **папки и страницы** |
| Paths | `""` index | `path="."` |
| Nav links | full href | relative (planned) |
| Ошибки | warn partial | actionable + dev overlay (planned) |

---

## Связанные документы

- [ROUTE_API_V3.md](./ROUTE_API_V3.md) — **источник правды** для attrs и lifecycle
- [NESTED_ROUTES.md](../NESTED_ROUTES.md) — engine design v0.2
- [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) — view layer, ViewHandle
- [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) — схлопывание sync redirect chains

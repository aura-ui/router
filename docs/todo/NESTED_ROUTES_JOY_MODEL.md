# Nested routes: модель «радости» (Route Folders)

> **Статус:** <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ В РАБОТЕ</span> · сверка с кодом **2026-07-13** (redirect resolve, lifecycle inherit override, link-active)  
> **Согласован с** [ROUTE_API_V3.md](./ROUTE_API_V3.md)  
> **Контекст:** как nested должны ощущаться через 5 лет — легко и интуитивно  
> **Область:** nested-специфика поверх v3 attrs; attrs и lifecycle — **из v3, не дублируем**  
> **Связь:** [NESTED_ROUTES.md](../NESTED_ROUTES.md) · [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md)

**Легенда:**

| Лейбл | Значение |
|-------|----------|
| <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в коде, тесты / демо |
| <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | база есть, контракт Joy не закрыт |
| <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> | не реализовано |
| <span style="background:#57606a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ НЕ ДЕЛАЕМ</span> | осознанно вне дизайна (не backlog) |
| <span style="background:#6f42c1;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⏸ ОПЦИОНАЛЬНО</span> | backlog после core DX (colocated, overlay, breadcrumbs) |

---

## Статус реализации

> **Политика:** colocated frame и dev overlay — основной backlog; declarative `redirect` **в engine** ✓; redirect из **`load`** — **не по дизайну**, будет убран из кода (см. [§Redirect chain collapse](#redirect-chain-collapse)).  
> **Код:** `src/modules/aura-route/`, `src/modules/aura-routing-engine/core/route-tree/`, `core/redirect/`, `aura-outlet/`

### Порядок минишагов

| # | Минишаг | Статус |
|---|---------|--------|
| 1 | Типы route: `page` / `folder` / `redirect`, `type` getter, `throwIfInvalidAttrs()` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 2 | External frame: `layout="id"` + `<template id>` в document | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 3 | Colocated frame: `layout="id"` + `<template id>` **внутри** folder (subtree → document) | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> |
| 4 | Relative child `path`, index `path="."` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 5 | Nested engine: LCA, `enterRoutes`, branch mount, sibling nav без remount frame | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 6 | `<aura-outlet>` в frame, `findNestedOutlet()` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 7 | Relative `href` (HTML-native + slash policy) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 8 | `data-router-active-class`, `data-branch-active-class`, `router.trail` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · `<aura-breadcrumbs/>` <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> |
| 9 | Dev UX: light DOM frame error, relative path warn, dev overlay | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> · `warnMissingLayoutOutlet` ✓; overlay / light-DOM error ✗; relative-path warn ⊘ |
| 10 | Nested 404 / catch-all в outlet folder | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> · scoped `path="*"` ✓ ([§Nested 404](#nested-404-scoped-catch-all)); miss без nested `*` / error scope ✗ |
| 11 | Attr `redirect` + engine navigation (без render) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · `followRedirectsWithGuardWalk`, `lookupNavigationStep`; тесты `redirect-resolver.integration.test.ts`, `engine-tree-integration.test.ts` |
| 12 | Redirect chain collapse ([§ниже](#redirect-chain-collapse)) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · declarative + `leave`/`guard` в одном `navigateTo`; redirect из `load` <span style="background:#57606a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ УБИРАЕМ</span> |

### Сводка по слоям

| Слой | Статус | Комментарий |
|------|--------|-------------|
| Engine nested (tree, LCA, outlet chain) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | см. [NESTED_ROUTES.md](../NESTED_ROUTES.md), [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) |
| Route types + attr validation | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | `AuraRoute.type`, `redirect` attr, `throwIfInvalidAttrs()` на render |
| Folder frame (external `layout`) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | `TemplateLoader` → `document.getElementById` |
| Folder frame (colocated) | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> | нужен lookup subtree route → document |
| Page + nested `view` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | `view` attr, view-graph loaders |
| Lifecycle inherit | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | `guard`/`leave`/`load`/`ready`; inherit через `closest` (**override**); opt-out `guard=""`; layering cold enter — `enterRoutes` |
| `cache` nested | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | dom / data / screen, sibling skip render |
| Links + active state | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | `resolveDocumentHref` + trailing slash ✓; `data-router-active-class` ✓; `data-branch-active-class` ✓; `router.trail` ✓; `<aura-breadcrumbs/>` ✗ |
| Redirect declarative | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | attr + `lookupNavigationStep` → `followRedirectsWithGuardWalk` до render |
| SSR / hydration | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> | RFC / adoption checklist |
| Nested scoped catch-all (`path="*"` in folder) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | matcher + branch mount; `nested-catch-all.integration.test.ts`; demo `routing-nested` |

### Принятые решения (2026-07-11)

| Тема | Решение |
|------|---------|
| **Scoped catch-all** | Декларативный `<aura-route path="*">` **внутри** folder — frame стабилен, 404 Page в nested outlet. Matcher (`/prefix/*`), `splat`, sibling nav без remount frame — **verified** (integration + demo). |
| **Folder URL без index** | **Не ошибка.** `/settings` без `path="."` → layout + **пустой outlet** — валидно (sidebar-only, placeholder в layout template). Dev warn **не делаем**. Альтернативы: index overview или `redirect`. |
| **Miss под folder без nested `*`** | Пока **не закрыто**: URL вне children → global `*` или root `not-found-template`; frame folder **теряется**. Backlog минишага 10 (не warn). |
| **Catch-all vs `error-template`** | Match miss → declarative `path="*"` + `view`. Load/render error → inherited `error-template` в child outlet — контракт P1 §13, отдельная проверка. |

### Принятые решения (2026-07-13)

| Тема | Решение |
|------|---------|
| **Declarative `redirect`** | В engine: `lookupNavigationStep` → `followRedirectsWithGuardWalk` в coordinator **до** render/history. Relative target через `resolveRedirectHref` + parent pattern. |
| **Redirect chain collapse** | Blocking `leave`/`guard` + declarative hops схлопываются в один `coordinator.run` (`skipBlockingPhases`). **Redirect из `load` не входит в модель** — убирается (сейчас в коде legacy + `console.warn`; auth/roles → `guard`). |
| **Colocated `<template>`** | По-прежнему **не в коде**: `TemplateLoader` / `getTemplate()` — только `document.getElementById`. Demo (`layout-templates.ts`) инжектит templates в `document.body` до старта router. |
| **Lifecycle attrs в примерах** | Shipped API — `guard` / `leave` / `load` / `ready` (не `enter` / `after`). |
| **`load` redirect** | **Не по дизайну.** `load` — только данные для view; «куда идти» — `guard` или attr `redirect`. В коде пока legacy path (`applyRedirect`); планируется удаление. |
| **Lifecycle inherit** | **Override на attr-уровне** (как CSS: nearest wins). Attr отсутствует → inherit с router/folder; явный attr → **заменяет** унаследованное; `guard=""` / `none` / `off` → opt-out. **Не делаем** auto-concat списков router + folder. Несколько hooks на узле — `guard="auth,role-check"`. Слои parent → child на cold enter — pipeline `enterRoutes` (см. [§Lifecycle и inherit](#lifecycle-и-inherit-v3--nested)). Attr `inherit-hooks` (v2 draft) — **не планируется**. |

---

## TL;DR

**Route Folders** — mental model для nested: URL = папки, children = файлы внутри.

Public API nested строится на **Route API v3**:

```text
1. Куда?  → path (+ relative внутри папки)
2. Что?   → view (Page) | frame + outlet (Folder: colocated `<template>` или `layout`)
3. Когда? → guard | leave | load | ready  (+ inherit с router и folder)
```

> **Имена в коде:** `guard` (было `enter` в v2), `ready` (post-commit, было `after`). См. [ROUTE_API_V3.md](./ROUTE_API_V3.md).

Дополнительно для nested (этот документ):

1. **Folder route** = frame + children + outlet — colocated `<template>` или `layout="id"`  
2. **Page route** = короткий `view` в outlet родительской папки  
3. **Paths** = относительные имена внутри папки  
4. **Hooks** = inherit (override) с `<aura-router>` и folder; opt-out `guard=""` / `guard="none"`; layering — `enterRoutes`  
5. **Links** = relative by default, active state бесплатно  

Engine (LCA, `enterRoutes`, outlet chain) **не ломаем** — меняем только DX поверх v3.

---

## Согласование с Route API v3

| Тема | v3 (реализуется) | Этот документ (nested-слой) |
|------|------------------|----------------------------|
| Контент leaf | `view="page.html"` → loader `url`; `view="html::…"` inline | то же; короткий attr внутри folder |
| Folder frame | `layout="template-id"` | external или colocated `<template id="…">` внутри folder |
| Lifecycle | `guard` · `leave` · `load` · `ready` | inherit вниз (**override**); cold enter — hooks по `enterRoutes` |
| Post-commit | `ready` + `ctx.phase` | analytics/scroll на folder или router |
| Кэш DOM | `cache` / `cache="data"` | folder frame: `cache`; leaf: по необходимости |
| Глобальные defaults | `guard`, `ready` на `<aura-router>` | auth один раз на router или folder |
| Анимации | `data-transition` на router, `transition` на route | sibling swap — outlet child, frame не трогаем |
| Escape hatch | `hooks="phase:hook-name"` | редкие asymmetric transitions |
| Deprecated | `source`+`content`, `html-src:…`, `entered`/`left`/`reenter`, `keep-alive` | в nested-примерах **не используем** |

**Не входит в v3 attrs** (nested RFC, реализуется отдельно):

| Фича | Статус |
|------|--------|
| Relative `data-router-link` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (href resolution + slash policy + active classes — [§Ссылки](#ссылки-html-native-без-link-resolver)) |
| `data-branch-active-class`, `router.trail` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| `<aura-breadcrumbs/>` CE | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> |
| `aura-route-fragment` / CMS partials | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> |

**Осознанно не делаем** (не backlog):

| Фича | Почему |
|------|--------|
| `[data-route-outlet]` marker (`<main data-route-outlet>` без CE) | Nested slot — **только** `<aura-outlet>` в layout template. Не апгрейдим plain HTML в `AuraOutlet`. См. [Nested outlet](#outlet-и-nested-прозрачность). |
| Dev warn «folder без index child» | Пустой outlet на URL folder — **осознанный** паттерн; не все разделы нуждаются в overview. Index или `redirect` — выбор разработчика, не runtime warn. |

---

## Зачем Route Folders

Nested в v3 уже проще (`layout` + короткий `view` на child), но разработчику всё ещё нужна **одна метафора**:

```text
/settings/           ← папка (layout frame)
  profile            ← страница (view)
  security           ← страница (view)
```

Термины parent/child/outlet/LCA — engine; в docs и onboarding — **папки и страницы**.

---

## Три типа route

| Тип | Разметка v3 | Пример URL | Статус |
|-----|-------------|------------|--------|
| **Page** | `path` + `view`, без children | `/about` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| **Folder** | children + `layout` | `/settings/*` | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> (external layout ✓; colocated ✗) |
| **Redirect** | `redirect="..."` | `/settings` → `/settings/profile` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (attr + `followRedirectsWithGuardWalk`; relative target ✓) |

Router определяет тип по DOM: `redirect` → Redirect; nested `<aura-route>` → Folder; иначе → Page.  
Детекция и валидация attrs — <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`AuraRoute.type`, `throwIfInvalidAttrs()`).

### Redirect (кратко)

URL без UI — сразу другой адрес. Статический alias в разметке; условный (auth, role) — `guard` hook.

```html
<aura-route path="/settings" redirect="/settings/profile"/>
<aura-route path="/app" layout="app-frame">
  <aura-route path="." redirect="dashboard"/>
  <aura-route path="dashboard" view="dashboard.html"/>
</aura-route>
```

| | `redirect` attr | Index Page (`path="."`) |
|--|-----------------|-------------------------|
| URL folder | уходит на target | показывает overview |
| UI | нет | есть |

Relative target (`redirect="dashboard"`) резолвится от parent path (`resolveRedirectHref`). Цепочки declarative + blocking `leave`/`guard` — один `navigateTo` ([§Redirect chain collapse](#redirect-chain-collapse)).

### Redirect chain collapse

**Целевая модель (закрыта):** схлопываются только источники **до render**:

| Источник | Схлопывание |
|----------|-------------|
| Attr `redirect` | ✓ `followRedirectsWithGuardWalk` |
| `guard` / `leave` hook | ✓ тот же resolve-walk |
| `load` hook → redirect | <span style="background:#57606a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ НЕ ДЕЛАЕМ</span> — убирается из API |

`load` не должен менять маршрут: сессия, роли, «нельзя сюда» — **`guard`**; статический alias — attr **`redirect`**.  
Сейчас redirect из `load` ещё может сработать через `applyRedirect` (второй `navigateTo`) с предупреждением в консоли — **временный legacy**, не backlog на collapse.

См. также [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) (исторический RFC; resolve с `runLoads` **не** планируется).

| Статический alias | Условный (auth, role) |
|-------------------|------------------------|
| `redirect="..."` | `guard` hook → `return '/path'` |

### Page (кратко)

Leaf без nested `<aura-route>`. Показывает `view` при каждом входе на URL.

| Где | Mount |
|-----|-------|
| Root (рядом с router) | root `<aura-outlet>` |
| Внутри folder | nested `<aura-outlet>` в layout template |

```html
<aura-route path="/about" view="about.html"/>
<!-- в folder -->
<aura-route path="profile" view="profile.html" load="fetch-user"/>
```

Index Page — `path="."` внутри folder; URL = URL folder, контент в outlet (не Redirect).

Inline HTML без `view` (raw children) — RFC; v3 canonical: `view="html::…"`.

### Folder: выбор разметки

```text
Нужен общий frame для нескольких URL?
  ├─ один раздел, colocated в одном файле → `layout="id"` + `<template id="id">` внутри folder
  └─ shared template / CMS               → `layout="template-id"` (template отдельно)

URL folder без суффикса (/settings)?
  ├─ overview на месте           → index Page (path=".")
  ├─ всегда default tab          → Redirect
  └─ sidebar-only / «выберите»   → layout + empty outlet (index не нужен)
```

---

## Folder route (v3)

### Shared frame: `layout` + template

```html
<template id="settings-frame">
  <header>
    <h1>Settings</h1>
    <nav>
      <a href="profile" data-router-link>Profile</a>
      <a href="security" data-router-link>Security</a>
    </nav>
  </header>
  <main><aura-outlet/></main>
</template>

<aura-route path="/settings" layout="settings-frame" guard="auth">
  <aura-route path="profile" view="profile.html"/>
  <aura-route path="security" view="security.html"/>
</aura-route>
```

| Правило | Поведение | Статус |
|---------|-----------|--------|
| Folder имеет `layout` | frame монтируется один раз при входе в ветку | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| В template — `<aura-outlet>` | child `view` рендерится в nested slot | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Нет outlet в template | `console.warn` (`warnMissingLayoutOutlet`) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Sibling nav | только child в `enterRoutes`; frame стабилен | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |

Shared layout между разделами — один `<template id="...">`, несколько folder routes.

### Colocated frame: `layout` + `<template id>`

Тот же контракт, что shared frame — один attr `layout`. Template может лежать **внутри** folder (one-file) или отдельно в документе.

```html
<aura-route path="/app" layout="app-frame" cache="screen">
  <template id="app-frame">
    <aside>
      <a href="dashboard" data-router-link>Dashboard</a>
      <a href="settings" data-router-link>Settings</a>
    </aside>
    <main><aura-outlet/></main>
  </template>

  <aura-route path="dashboard" view="dashboard.html"/>
  <aura-route path="settings" view="settings.html"/>
</aura-route>
```

| | Colocated `<template id>` (inert) | Frame в light DOM `<aura-route>` |
|--|-----------------------------------|-----------------------------------|
| **Статус** | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> (subtree lookup) | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> (dev error не выбрасывается) |
| **До загрузки JS** | Пустой root `<aura-outlet>`; sidebar в `<template>` **не отображается** | Sidebar и outlet **сразу на экране** у всех разделов |
| **Разметка** | `layout`, template, outlet и children — **в одном** `<aura-route>` | Тот же блок, но frame **не inert** — flash и SEO-проблемы |
| **Engine** | `layout` → clone template по id (subtree, затем document) | Отдельный антипаттерн |

**Проблема light DOM inline:** frame как обычный HTML внутри `<aura-route>` — браузер рисует до JS, все разделы сразу. Только **inert `<template>`** + `layout`.

> **Inert** — разметка лежит в HTML-файле, но браузер **не показывает** её на экране (`<template>` не рисуется сам по себе). Router копирует её в outlet после загрузки JS.

**SSR:** сервер вставляет в `<aura-outlet>` **готовый HTML текущей страницы** (frame + контент для этого URL). Определения маршрутов (`<aura-route>`, `<template>`) остаются скрытыми — в выдаче один осмысленный документ, не все разделы сразу.

> **CSR** (client-side rendering) — браузер получает «пустой» HTML, контент появляется **после** загрузки JS. **SSR** — сервер сразу отдаёт готовую разметку страницы в HTML.

**Getting Started vs production:**

| Сценарий | Рекомендация |
|----------|--------------|
| Обучение, один folder | colocated `layout="id"` + `<template id="id">` |
| Shared frame, CMS | `layout="template-id"` |
| Сайт, где важен Google / первый экран | **Одного «JS рисует всё» мало:** сервер должен отдать готовый HTML в outlet (**SSR**), иначе до загрузки скриптов — пустая страница. Либо skeleton на router |

```html
<!-- ❌ не так: frame виден до router и при всех routes -->
<aura-route path="/app">
  <aside>...</aside>
  ...
</aura-route>
```

Нет outlet при children → `warnMissingLayoutOutlet`. URL folder без index → **layout + пустой outlet** (by design, см. [решения](#принятые-решения-2026-07-11)). Unknown child под folder → scoped catch-all `path="*"` в outlet ([§Nested 404](#nested-404-scoped-catch-all) ✓) или global `*` / Redirect.

Engine: `layout` → clone `<template id="…">`; `findNestedOutlet()` ищет **только** `<aura-outlet>` внутри смонтированного frame.

| | Colocated `<template>` | `layout="template-id"` |
|--|------------------------|------------------------|
| **Статус** | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Файл | frame внутри `<aura-route>` | frame отдельно |
| Shared frame | extract template наружу | один id, N folders |
| Inert / SEO-safe | да | да |
| v3 attrs | `guard`, `cache` | `layout`, `guard`, `cache` |

UA default: `aura-route { display: none }` — <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> (рекомендация docs; в shipped CSS пока не зафиксировано).

### Вложенные folders

Folder внутри folder — цепочка frames и outlets:

```html
<aura-route path="/admin" layout="admin-frame" guard="auth">
  <aura-route path="users" layout="users-frame">
    <aura-route path="." view="users-list.html"/>
    <aura-route path=":id" view="user-detail.html"/>
  </aura-route>
</aura-route>
<!-- /admin/users/42 → admin-frame → users-frame → page -->
```

### Index child

```html
<aura-route path="/dashboard" layout="app-frame">
  <aura-route path="." view="overview.html"/>
  <aura-route path="users" view="users.html"/>
</aura-route>
```

Canonical: **`path="."`** (не пустой `path=""`).

Inline folder:

```html
  <aura-route path="/dashboard" layout="app-frame" cache="screen">
  <template id="app-frame">
    <nav>...</nav>
    <main><aura-outlet/></main>
  </template>
  <aura-route path="." view="overview.html"/>
  <aura-route path="users" view="users.html"/>
</aura-route>
```

### Nested 404 (scoped catch-all)

Неизвестный сегмент **под** folder prefix — frame остаётся, 404 только в nested outlet:

```html
<aura-route path="/settings" layout="settings-frame">
  <aura-route path="." view="overview.html"/>
  <aura-route path="profile" view="profile.html"/>
  <aura-route path="*" view="settings-not-found.html"/>
</aura-route>
```

| URL | Match | UI |
|-----|-------|-----|
| `/settings/` | index `.` | frame + overview |
| `/settings/profile` | profile | frame + profile |
| `/settings/unknown` | scoped `*` → `/settings/*` | frame + not-found view |
| `/settings` (без index) | folder parent | frame + **empty outlet** — OK |

| | Статус |
|--|--------|
| Matcher scoped `*` (`/prefix/*`), param `splat` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Branch mount: layout stable, catch-all в nested outlet | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · `nested-catch-all.integration.test.ts` |
| Demo | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · `public/features/routing-nested` |
| Miss без nested `*` (frame теряется → global/root 404) | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> |
| Load error → `error-template` в child outlet, frame жив | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> · контракт P1 §13, без e2e |

Global `path="*"` на router — отдельно; не смешивать со scoped catch-all внутри folder.

---

## Paths: как в файловой системе

> Внутри папки — имя файла. Полный path — только если route **вне** folder в DOM.

```html
<!-- ✅ -->
<aura-route path="/settings" layout="settings-frame">
  <aura-route path="profile" view="profile.html"/>
</aura-route>

<!-- ⚠️ dev: "profile уже под /settings" -->
<aura-route path="/settings/profile" view="profile.html"/>
```

---

## Lifecycle и inherit (v3 + nested)

### Четыре слота на route

| Attr | Когда | Nested note |
|------|-------|-------------|
| `guard` | guard до активации | folder `guard="auth"` → все children |
| `leave` | guard до ухода | child leave при sibling swap; folder leave при выходе из ветки |
| `load` | данные до render | parallel на `enterRoutes` (engine) |
| `ready` | post-commit | `ctx.phase`: `entered` \| `reenter` \| `left` |

Hook в `ready` не нужно дублировать на каждый child, если достаточно router default.

### Inherit: router → folder → page

```html
<aura-router guard="auth" ready="analytics">
  <aura-outlet/>

  <aura-route path="/login" view="login.html" guard=""/>

  <aura-route path="/app" layout="app-frame">
    <aura-route path="dashboard" view="dashboard.html"/>
    <!-- inherit: guard=auth, ready=analytics -->
    <aura-route path="public" view="public.html" guard=""/>
  </aura-route>
</aura-router>
```

| Механизм | Поведение |
|----------|-----------|
| Attr на `<aura-router>` | defaults для всего дерева (если на route attr нет) |
| Attr на folder | **override** router default на этой ветке (nearest wins) |
| Attr отсутствует на child | inherit ближайшего ancestor (folder → router) |
| Явный attr на child | **заменяет** унаследованное значение целиком |
| `guard=""` / `guard="none"` / `leave=""` / … | opt-out: слот пуст на **этом** node (≠ отсутствие attr) |
| Несколько hooks на одном node | `guard="auth,role-check"` (comma-list в одном attr) |
| Cold enter nested URL | pipeline: `enterRoutes` root→leaf — guard folder, затем guard leaf (разные routes) |
| Sibling nav в folder | только child в `enterRoutes`; folder guard **не** re-run |

Отдельный attr `isolated` **не нужен** — v3: `guard=""` / `guard="none"` и override.  
Attr-level **concat** router + folder (`auth` + `section-check` автоматически) — **не по дизайну**; нужны оба → явно `guard="auth,section-check"` на folder. См. [LIFECYCLE_PLACEMENT.md](../LIFECYCLE_PLACEMENT.md).

```html
<!-- folder: auth + своя проверка — явно, без magic merge -->
<aura-router guard="auth">
  <aura-route path="/admin" layout="admin-frame" guard="auth,admin-role">
    <aura-route path="users" guard="users-policy" view="users.html"/>
    <!-- cold enter /admin/users: enterRoutes → auth+admin-role (folder), users-policy (leaf) -->
  </aura-route>
</aura-router>
```

### UX-слой для onboarding (не attrs)

Pipeline по-прежнему детальный; в docs для app-dev — три слова:

```text
Leaving…  →  Loading…  →  Ready
     ↑            ↑           ↑
  leave        load      ready (entered)
```

При sibling nav: frame folder не мигает; Loading/Ready только на outlet child.

---

## Router defaults (v3)

```html
<aura-router
  guard="auth"
  ready="analytics"
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
| `guard`, `ready` | один раз auth/analytics |
| `loading-template`, `error-template` | inherit; nested error в child outlet |
| `data-transition` | политика outlet |
| `scroll` | `restore` \| `top` \| `manual` |

Folder route переопределяет только отличия; leaf — минимум attrs:

```html
<aura-route path="profile" view="profile.html" load="fetch-user"/>
```

---

## `cache` в nested

| Route | Рекомендация |
|-------|--------------|
| Folder frame | `cache` — sidebar не пересоздавать при sibling nav |
| Leaf с формой | `cache` или `cache="all"` |
| Leaf feed/list | `cache="data"` |

```html
<aura-route path="/app" layout="app-frame" cache="screen">
  <aura-route path="editor" view="component::app-editor" cache="all"/>
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

Nested slot для child-страниц — **только `<aura-outlet>`** внутри layout template (после clone frame). Не отдельная концепция в Getting Started.

### Про `[data-route-outlet]` — <span style="background:#57606a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ НЕ ДЕЛАЕМ</span>

В раннем RFC предлагалось ставить в frame обычный HTML-marker без id:

```html
<!-- ❌ не делаем: plain div/section + data-attr -->
<main data-route-outlet></main>
```

Идея была: engine при mount layout **создаёт или биндит** `AuraOutlet` на этот узел (чтобы не писать CE в разметке).

**Решение по дизайну:** не поддерживаем. Вложенный outlet без отдельного id — это **`<aura-outlet>`** в `<template>` / document template. Один контракт, stage/patch/cache работают на CE, без magic upgrade plain HTML.

| | `<aura-outlet>` в frame | `<main data-route-outlet>` |
|--|-------------------------|----------------------------|
| Статус | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | <span style="background:#57606a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ НЕ ДЕЛАЕМ</span> |
| Где | layout template | — |
| `findNestedOutlet()` | да | нет |

Контент child — как `<slot>` для навигации: root Page → root outlet; nested Page → `<aura-outlet>` folder frame.

---

## Ссылки (HTML-native, без link resolver)

> **Контракт:** `href` в разметке — единственный источник правды для краулера, noscript и Aura.  
> Router на клике резолвит так же, как браузер: `new URL(href, location.href)` — base = **адресная строка**, не attr `path`.  
> **Canonical URL policy:** index folder — **с trailing slash** (`/app/settings/`); leaf — без slash (`/app/settings/profile`).  
> Engine: redirect `/app/settings` → `/app/settings/` при входе в index child.

### Пример разметки

```html
<aura-router>
  <aura-outlet/>

  <aura-route path="/app/settings" layout="settings-frame">
    <template id="settings-frame">
      <nav>
        <a href="profile" data-router-link>Profile</a>
        <a href="users" data-router-link>Users</a>
        <a href="." data-router-link>Overview</a>
        <a href="/" data-router-link>Home</a>
      </nav>
      <aura-outlet/>
    </template>

    <aura-route path="." view="overview.html"/>
    <aura-route path="profile" view="profile.html"/>
    <aura-route path="users" view="users.html"/>
  </aura-route>
</aura-router>
```

Маршруты в дереве:

| `path` attr | URL (canonical) |
|-------------|-----------------|
| `/app/settings` + `.` | `/app/settings/` |
| `profile` | `/app/settings/profile` |
| `users` | `/app/settings/users` |

### Куда ведут ссылки в nav (при canonical URL)

Базовый URL страницы → итоговый `href` после HTML resolution (то же видит Google и Aura):

#### Сейчас `/app/settings/` (index folder)

| Ссылка в layout | Куда резолвится |
|-----------------|-----------------|
| `href="profile"` | `/app/settings/profile` |
| `href="users"` | `/app/settings/users` |
| `href="."` | `/app/settings/` |
| `href="/"` | `/` |

#### Сейчас `/app/settings/profile`

| Ссылка | Куда |
|--------|------|
| `href="profile"` | `/app/settings/profile` (self) |
| `href="users"` | `/app/settings/users` (sibling) |
| `href="."` | `/app/settings/` (index folder) |
| `href="/"` | `/` |

#### Сейчас `/app/settings/users`

| Ссылка | Куда |
|--------|------|
| `href="profile"` | `/app/settings/profile` |
| `href="users"` | `/app/settings/users` |
| `href="."` | `/app/settings/` |

### ⚠️ Без trailing slash на index (антипаттерн)

**Откуда берётся URL для расчёта `href`:** из **адресной строки браузера** (`location.href` / `location.pathname`) — того, что записал history после навигации.  
**Не** из attr `path` на `<aura-route>`: `path="/app/settings"` задаёт **match** в route tree, но HTML resolution ссылок его **не читает**.

```text
Разметка:     <aura-route path="/app/settings">     ← matcher / TransitionPlan
Адресная строка: https://site/app/settings          ← base для href="users"
```

Если в **адресной строке** index folder без slash — **`/app/settings`** (а не `/app/settings/`), HTML resolution **ломается** относительно route tree:

| Ссылка | Резолв (плохо) | Ожидали (route tree) |
|--------|----------------|----------------------|
| `href="profile"` | `/app/profile` | `/app/settings/profile` |
| `href="users"` | `/app/users` | `/app/settings/users` |

Почему: для base `/app/settings` (последний сегмент `settings` **не** «директория») алгоритм HTML **заменяет** последний сегмент, а не дописывает в «папку».  
Для base `/app/settings/` (trailing slash) сегмент считается directory → `users` → `/app/settings/users` ✓.

**Что должен делать engine:** при входе на index child (`path="."`) коммитить в history **canonical** URL **`/app/settings/`** (replace/redirect), даже если `path` parent в разметке без slash.  
**В коде:** trailing-slash canonicalize <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`applyCanonicalIndexFolderHref` в `canonical-index-href.ts`; commit в `lookupNavigationStep` / coordinator).

### `../` и `../../` — выход из folder и вложенность

Path-relative с `..` следуют **URL страницы**, не «route tree API».

#### На leaf `/app/settings/profile`

| Ссылка | Куда |
|--------|------|
| `href=".."` | `/app/settings/` |
| `href="../users"` | `/app/settings/users` |
| `href="../profile"` | `/app/settings/profile` |
| `href="../../"` или `href="/app/"` | `/app/` (на уровень выше `/app/settings/`) |
| `href="../../dashboard"` | `/app/dashboard` (если есть route `/app/dashboard`) |

#### На index `/app/settings/`

| Ссылка | Куда |
|--------|------|
| `href=".."` | `/app/` |
| `href="../dashboard"` | `/app/dashboard` |
| `href="../../"` | `/` (два уровня вверх от `/app/settings/`) |

#### Вложенные folders — пример `../../`

```html
<aura-route path="/app" layout="app-frame">
  <template id="app-frame">…<aura-outlet/></template>

  <aura-route path="dashboard" view="dashboard.html"/>

  <aura-route path="settings" layout="settings-frame">
    <template id="settings-frame">
      <nav>
        <a href="profile" data-router-link>Profile</a>
        <a href="../../dashboard" data-router-link>Dashboard</a>
      </nav>
      <aura-outlet/>
    </template>
    <aura-route path="." view="overview.html"/>
    <aura-route path="profile" view="profile.html"/>
  </aura-route>
</aura-router>
```

На странице **`/app/settings/profile`**:

| Ссылка | Куда |
|--------|------|
| `href="profile"` | `/app/settings/profile` |
| `href="../../dashboard"` | `/app/dashboard` (`profile` → `settings/` → `app/` → `dashboard`) |

На **`/app/settings/`**:

| Ссылка | Куда |
|--------|------|
| `href="../dashboard"` | `/app/dashboard` |
| `href="../../dashboard"` | `/dashboard` (два уровня вверх: `settings/` → `app/` → root — **не** `/app/dashboard`) |

> **Подсказка:** с index folder (`/app/settings/`) на sibling checksibling в parent folder — **`../segment`**, не `../../`.  
> `../../` нужен, когда текущий URL на **leaf** (`/app/settings/profile`) и target на уровне `/app/…`.

### Absolute vs relative — когда что

| `href` | Когда использовать |
|--------|-------------------|
| `profile`, `users` | Sibling / child в **той же** folder; нужен canonical slash на index |
| `.` | Index текущей folder |
| `..`, `../users` | Parent / sibling через parent path |
| `../../…` | Target в ancestor folder (обычно с leaf URL) |
| `/`, `/app/dashboard` | Root или любой absolute path — всегда однозначно, лучший SEO fallback |

### Migration (legacy HTML)

Существующие absolute ссылки **не меняем** — Aura перехватывает клик и ведёт на тот же URL:

```html
<a href="/legacy/catalog.html">Catalog</a>
```

| Фича | Статус |
|------|--------|
| Перехват клика `[data-router-link]` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Navigate по `href` as-is (absolute) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Relative `href` → `new URL(href, location.href)` на клике | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`resolveLinkHref` / `resolveDocumentHref` в `link-resolve.ts`, `app-href.ts`) |
| Canonical trailing slash на folder index | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`applyCanonicalIndexFolderHref` в `canonical-index-href.ts`) |
| `data-router-active-class` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`syncRouterHostActiveLinks` после `navigation`) |
| `data-branch-active-class` на folder | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (prefix match в `link-active/match.ts`) |
| `router.trail` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`toRouteTrail` на `<aura-router>`) |
| `<aura-breadcrumbs/>` CE | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> (данные есть через `router.trail`; UI-компонент не shipped) |

---

## Ошибки как наставник

```text
❌ Route "profile" uses relative path but is not nested in a folder.
   Nest inside: <aura-route path="/settings"> …

❌ Folder "/settings" has children but no outlet.
   Add: <aura-outlet> in frame/template

✓ /settings/profile → /settings/security
  Keeping: settings frame (inline or layout)
  Swapping: profile → security in outlet
```

Dev overlay: дерево, active branch, resolved paths — <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> (сейчас `throw` / `console.warn` на отдельных кейсах: `throwIfInvalidAttrs`, `warnMissingLayoutOutlet`, duplicate pattern).

---

## CMS и split HTML (RFC)

```html
<aura-route-fragment for="/settings">
  <aura-route path="profile" view="profile.html"/>
  <aura-route path="security" view="security.html"/>
</aura-route-fragment>
```

Не входит в v3; под капотом — `aura-route-group`.

---

## Минимальный первый опыт (colocated template)

```html
<aura-router guard="auth" ready="analytics">
  <aura-outlet/>

  <aura-route path="/" view="html::<h1>Home</h1>"/>

  <aura-route path="/app" layout="app-frame" cache="screen">
    <template id="app-frame">
      <aside>
        <a href="dashboard" data-router-link>Dashboard</a>
        <a href="settings" data-router-link>Settings</a>
      </aside>
      <main><aura-outlet/></main>
    </template>
    <aura-route path="dashboard" view="dashboard.html"/>
    <aura-route path="settings" view="settings.html"/>
  </aura-route>

  <aura-route path="/login" view="login.html" guard=""/>
</aura-router>
```

> **Colocated пример выше** — целевой DX; в коде template должен быть в `document` (см. `installDemoLayoutTemplates` в demo). Subtree lookup — backlog минишага 3.

Тот же сценарий с shared `layout="app-frame"` — см. [Shared frame: layout + template](#shared-frame-layout--template).

---

## Mapping на engine

| Public (v3 + nested) | Engine | Статус |
|----------------------|--------|--------|
| Folder `layout` | `viewKind: 'layout'` → template по id → `findNestedOutlet()` | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> (document id ✓; subtree ✗) |
| Leaf `view` | `buildContentDescriptor(view)` → mount в parent outlet | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Router/folder inherit | `@routeAttr({ inherit })` + `closest` (override); opt-out `none`/`off`/`""` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · `lifecycle-inherit.test.ts` |
| Layering parent → child hooks | `enterRoutes` + `runLifecyclePhase(guard)` root→leaf | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · sibling — только child |
| `cache` | view cache + skip re-render на sibling nav | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Relative paths | `resolvePattern(parent, child)` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| `path="."` | `normalizeRouteSegment('.')` → index child | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| `redirect` | match → `followRedirectsWithGuardWalk` → navigate target без render | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Scoped catch-all `path="*"` in folder | match → leaf `view` в nested outlet; frame в `enterRoutes` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Relative links / branch-active | HTML-native `href` + slash policy ✓; active classes + `router.trail` ✓; `<aura-breadcrumbs/>` ✗ | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> |
| Route `type` + attr validation | `AuraRoute.type`, `throwIfInvalidAttrs()` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |

---

## Что сознательно не в default API

| Фича | Почему |
|------|--------|
| Named / parallel outlets | modals → portal / отдельный CE |
| `preload` на route | link intent + `router.prefetch()` (v3) |
| Param inheritance на folder | params на leaf |
| 9 phase attrs на route | v3: 4 слота + `hooks` escape |
| Attr-level hook list concat (router + folder auto-merge) | override + comma на одном attr; parent→child — `enterRoutes` |
| `inherit-hooks` bool attr (v2 draft) | заменён router/folder defaults + override + `enterRoutes` |

**Антипаттерны:** folder с children без frame/outlet; `layout` на leaf без children; absolute path на child уже внутри folder.

---

## Аудит: известные дыры и контракты

Проверка proposal на противоречия, SEO, SSR, inherit и edge cases. **P0** — закрыть до реализации; **P1/P2** — RFC или docs.

### P0 — ломают модель, если не зафиксировать

| # | Дыра | Контракт / mitigation | Код |
|---|------|------------------------|-----|
| 1 | **Light DOM frame** в `<aura-route>` | Запрет + dev error. Только inert: external `layout`, colocated `<template>`. | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> |
| 2 | **Plain HTML outlet marker** (`data-route-outlet`) | **Не делаем.** Только `<aura-outlet>` CE в layout template. | <span style="background:#57606a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ НЕ ДЕЛАЕМ</span> |
| 3 | **CSR без SSR: пустая страница до JS** | Пустой `<aura-outlet>` до JS; skeleton или SSR. | <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span> (docs only) |
| 4 | **Тип route: конфликтующие attrs** | `redirect` + children / `view` / `layout` → error; folder + `view` → error. | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`throwIfInvalidAttrs`) |
| 5 | **Folder без `layout`** | children есть, нет `layout` → dev error | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (на render, не at collect) |
| 6 | **Inherit: override semantics** | Attr: nearest wins + `guard=""` opt-out; несколько hooks — comma на node; parent→child — `enterRoutes`. Auto-concat уровней — **не делаем**. | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`lifecycle-inherit.test.ts`, `PHASES.guard` / `enterRoutes`) |
| 7 | **Top-level Redirect vs Folder** | `redirect` без frame = Redirect type, не Folder. | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (type + `lookupNavigationStep` + coordinator) |

### P1 — UX / SEO / hydration

| # | Дыра | Контракт / mitigation |
|---|------|------------------------|
| 9 | **`<template>` в HTML source (CSR)** | Inert для render, но текст/ссылки **в исходнике** страницы. Краулер может видеть дубли nav. Mitigation: SSR active branch; или frame вынести в external chunk; не light DOM. |
| 10 | **Hydration mismatch (SSR)** | Сервер: outlet = frame + page. Клиент: не re-clone frame если markup совпадает — **hydrate** outlet, не replace. Иначе flash + double mount. |
| 11 | **`data-router-link` в frame до mount** | Ссылки в template inactive до clone. Делегирование на `aura-router` после mount; в shipped HTML — resolved absolute `href` (SSR/build) или path-relative по [HTML-native контракту](#ссылки-html-native-без-link-resolver). |
| 12 | **Scroll `restore` nested** | Scroll scope: **leaf outlet** по умолчанию; frame scroll отдельно (`cache` frame). `scroll="restore"` на router + key = `viewCacheKey` per leaf. |
| 13 | **Loading / error scope** | Первый enter folder+child: loading в **child outlet**; frame уже виден. Error в child — **не** снимает parent frame. Error при mount frame — fail всей ветки. |
| 14 | **`cache` + exit/re-enter ветки** | Exit branch → stash frame handle по folder cache key. Re-enter → restore, не re-clone template. Sibling nav → skip render (LCA), не путать с re-enter. |
| 15 | **Transitions** | `data-transition` на router: по умолчанию animate **leaf outlet** only; frame вне transition. Override: `transition` на route или `hooks`. |

### P2 — edge cases, позже

| # | Дыра | Контракт / mitigation |
|---|------|------------------------|
| 16 | **Несколько `<aura-outlet>`** в frame | Dev error: ровно один nested outlet. Named outlets — v0.3+. |
| 17 | **Вложенные folders + cache** | Каждый folder level — свой frame handle и nested outlet; cache per level. |
| 18 | **`aura-route-fragment`** | Children вне DOM folder — paths **absolute** или `for=` задаёт base; folder-relative не работает без anchor. |
| 19 | **`path="."` vs engine `""`** | Alias при collect: `"."` → index child. Canonical в docs: `"."`. | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 20 | **Catch-all / 404 в folder** | `/settings/*` → parent frame + catch-all Page в outlet. Global `*` — отдельно. | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> (declarative scoped `*` ✓; miss без `*` ✗) |
| 21 | **Deep link auth** | Cold enter: `enterRoutes` root→leaf (folder guard → child guard). Sibling: только child в `enterRoutes` — parent guard не re-run. | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| 22 | **noscript** | Без JS: `<a href>` с absolute URLs в frame (resolved at build/SSR). Router-enhanced nav — progressive enhancement. |

### Противоречия в proposal (исправлено в этом доке)

| Было | Стало |
|------|-------|
| «inline frame» = light DOM в route | inline = **colocated inert `<template id>`** + `layout` |
| Folder без `layout` в colocated примере | folder требует attr `layout` (id template в subtree или document) |
| `guard=""` / `guard="none"` opt-out | opt-out для любого inherited slot (`leave=""` и т.д.) |
| «concat hook lists router + folder» | **Убрано** — override + comma на node + `enterRoutes` layering |
| Relative links в примерах | HTML-native `href` + trailing slash policy ([§Ссылки](#ссылки-html-native-без-link-resolver)) |
| «folder must have index» dev warn | folder без index → **empty outlet OK**; warn убран ([§Принятые решения](#принятые-решения-2026-07-11)) |

### Decision tree (valid route node)

```text
<aura-route>
  redirect?           → Redirect (no children, no view, no layout)
  nested <aura-route>? → Folder (require `layout`)
  else                → Page (require view, no layout)
```

---

## Open questions

1. **Hydration** — атрибуты/markers на server-rendered outlet vs client clone (см. аудит §10) — <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span>
2. ~~**Nested 404 declarative**~~ — scoped `path="*"` в folder ✓ ([§Nested 404](#nested-404-scoped-catch-all)). Открыто: miss без nested `*`; catch-all Page vs `error-template` при load error.
3. ~~**`path="."` engine alias**~~ — <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`normalizeRouteSegment`)
4. **Template в HTML source vs SEO** — build-time strip для CSR-only (см. аудит §9) — <span style="background:#cf222e;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ НЕТ</span>
5. ~~**Folder без index — dev warn?**~~ — **нет warn**; empty outlet by design ([§Принятые решения](#принятые-решения-2026-07-11))
6. ~~**Declarative `redirect` в engine**~~ — <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`core/redirect/`).
7. ~~**Collapse redirect из `load`**~~ — **не делаем**; redirect из `load` убирается по дизайну ([§Redirect chain collapse](#redirect-chain-collapse)).
8. ~~**Inherit: concat vs override**~~ — **override** на attr; layering — `enterRoutes`; auto-concat уровней — **не делаем** ([§Принятые решения 2026-07-13](#принятые-решения-2026-07-13)).

Вопросы v3:

- Пустой `guard=""` vs отсутствие attr — см. [ROUTE_API_V3.md §Открытые вопросы](./ROUTE_API_V3.md#открытые-вопросы) (отсутствие = inherit; `""` / `none` = opt-out)
- `ready` + blocking semantics для `left` phase

---

## Сравнение: v2 design → v3 + Route Folders

| Аспект | v2 / старый design | v3 + Route Folders | Код |
|--------|-------------------|-------------------|-----|
| Leaf content | `source` + `content` | `view="page.html"` (`url`) · `view="html::…"` · `view="component::…"` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Folder frame | `layout` + template | colocated `<template>` или external `layout` | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> |
| Lifecycle | 9 attrs | 4: `guard` `leave` `load` `ready` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Inherit | `inherit-hooks` | router/folder defaults + override + `guard=""` opt-out + `enterRoutes` layering | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Кэш | `keep-alive` + `cache` | `cache` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Mental model | parent/child/outlet | **папки и страницы** | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> (`type` ✓) |
| Paths | `""` index | `path="."` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Nav links | full href | relative | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> (href + slash + active classes ✓; `<aura-breadcrumbs/>` ✗) |
| Redirect attr | — | `redirect="…"` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Redirect chain collapse | — | declarative + `guard`/`leave` в одном hop | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · `load` redirect <span style="background:#57606a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ убираем</span> |
| Scoped catch-all in folder | — | nested `path="*"` + `view` | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> |
| Ошибки | warn partial | actionable + dev overlay | <span style="background:#bf8700;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> (`throwIfInvalidAttrs`, `warnMissingLayoutOutlet`) |

---

## Связанные документы

- [ROUTE_API_V3.md](./ROUTE_API_V3.md) — **источник правды** для attrs и lifecycle
- [NESTED_ROUTES.md](../NESTED_ROUTES.md) — engine design v0.2
- [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) — view layer, ViewHandle
- [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) — схлопывание sync redirect chains
- [`core/redirect/README.md`](../../src/modules/aura-routing-engine/core/redirect/README.md) — as-is redirect resolve в engine

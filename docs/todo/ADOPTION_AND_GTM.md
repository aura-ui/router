# Перспективы Aura Router и go-to-market

> **Статус:** стратегия / GTM (2026-06-27)  
> **Контекст:** перспективы после готовности (P0 + v3 + Route Folders), сравнение с RR7/TanStack, план продвижения  
> **Связь:** [FEATURE_PARITY_ROADMAP.md](../comparison/FEATURE_PARITY_ROADMAP.md) · [COMMERCIAL_MODEL.md](../COMMERCIAL_MODEL.md) · [COMPETITORS.md](../COMPETITORS.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md) · [NESTED_ROUTES_JOY_MODEL.md](./NESTED_ROUTES_JOY_MODEL.md)

---

## TL;DR

**Место на рынке есть** — не «новый React Router для всех», а **#1 HTML-first роутер для WC + MPA→SPA**.

**Позиционирование (одна фраза):**

> Aura Router — declarative nested routing в HTML: MPA→SPA без React, с lifecycle как у data router.

**Быстрее всего расти:** 1 killer MPA→SPA demo → npm 1.0 → Lit/Vaadin channels → monetize support, не downloads.

---

## Перспективы после готовности

### Рынок

| Фактор | Что даёт Aura |
|--------|----------------|
| **Vaadin Router deprecated** | Vacuum среди WC/Lit |
| **Lit Router** — JS/Lit-only, labs | Нет declarative HTML + SSR partials |
| **React Router / TanStack** | Сильны в React; MPA→SPA на server HTML — слабо |
| **HTMX / Astro View Transitions** | Другой класс; не nested SPA с lifecycle |

### Вероятности (из roadmap проекта)

| Исход | Оценка | Условие |
|-------|--------|---------|
| **#1 в HTML-first WC-роутинге** | 70–80% | P0 + killer demo (Astro/Express MPA→SPA) |
| Устойчивая community в нише | 50–65% | semver, CI, Lit/WC community |
| Заметные npm downloads | 40–55% | время + контент |
| Breakout уровня TanStack | 15–25% | Lit ecosystem + timing |
| Заменить RR/TanStack в React-командах | ~0% | inertia stack/hiring |

### ICP (ideal customer profile)

1. **Legacy MPA → SPA** без React (Express/Astro + `html-src` partials)
2. **Lit / vanilla WC** — routing в HTML, hooks в `main.ts`
3. **CMS / SSR** — route tree в разметке
4. **Enterprise WC** — rich lifecycle (leave, reenter, audit)
5. **Ex-Vaadin** — migration path

### Масштаб adoption (реалистично)

| Этап | Кто приходит | Оценка |
|------|--------------|--------|
| P0 shipped | early adopters | десятки–сотни |
| P0 + demo + npm 1.0 | production pilots | **500–1000** devs в нише за 3–5 лет |
| P0+P1 + community | WC-сегмент | **тысячи** — да, не миллионы downloads |
| Enterprise support | платящие клиенты | **10–30** × $15–50k/год — основной доход |

1000 довольных разработчиков в нише — **сильный результат** для infra-OSS.

---

## Сравнение «лёгкости» после реализации (vs RR7 / TanStack)

Оценки **после** v3 + Route Folders + P0 (nested outlet, DataGraph).

| Сценарий | Aura | RR7 | TanStack |
|----------|:----:|:---:|:--------:|
| Первый route с нуля | 8.5 | 7 | 6* |
| Nested dashboard | 8 | 8 | 8.5 |
| Data + cache | 7 | 8 | 9 |
| TypeScript / IDE | 4 | 7 | 10 |
| HTML / WC без React | 9 | 3 | 2 |
| MPA→SPA (`html-src`) | 9 | 4 | 4 |

\* TanStack: порог выше, потом сильнее типами.

**Vs React routers:** Aura **не обгонит** TanStack по data/types/ecosystem. **Выиграет** там, где роут виден в HTML и React не нужен.

**Прирост для Aura vs себя сейчас:** ~**40–50%** легче (ROUTE_API_V3).

---

## Go-to-market: что делать

### 1. Killer demo (важнее feature count)

Один сценарий:

```text
Express/EJS MPA  →  <aura-router>  →  nested dashboard
                     html-src partials с сервера
                     auth на folder, sibling nav без remount sidebar
                     < 15 мин в playground
```

**Marketing hook:** «MPA to SPA in one afternoon» / «Server HTML fragments + nested routes».

### 2. Time-to-first-router < 15 мин

| Must have | Зачем |
|-----------|--------|
| StackBlitz / playground | без clone |
| Copy-paste HTML + hooks (`auth`, analytics) | не читать pipeline |
| Одна страница docs: path · view · enter | v3 mental model |

### 3. Каналы (не «весь frontend»)

| Канал | ROI |
|-------|-----|
| Lit Discord / GitHub | высокий |
| Astro community | высокий |
| Vaadin migration guide | высокий |
| dev.to / Habr (MPA→SPA) | средний |
| React Twitter / «vs TanStack» | **низкий — не тратить** |

### 4. Доверие (блокер enterprise)

```text
semver 1.0 · CI E2E · CHANGELOG · SECURITY.md · 1 production case study
```

### 5. Контент под нишу

| Тема | Уникальность Aura |
|------|-------------------|
| Nested routes в HTML | Route Folders |
| Prefetch LCA-delta + html-src | vs JSON loaders |
| leave / reenter / unsaved | Lit Router gap |
| Route tree для CMS | SSR |
| Vaadin migration | direct capture |

### 6. Монетизация (sustainability)

Core MIT. Деньги:

| Продукт | Кто платит |
|---------|------------|
| Enterprise Support + SLA | банки, gov, e-com на WC |
| Migration workshop MPA→SPA | агентства |
| DevTools Pro | команды 5+ |
| Vite/Astro plugin (enterprise) | platform |

**10 × $25k/год** > 100k npm downloads для solo maintainer.

---

## Roadmap продвижения

```text
Фаза 0 — до 1.0
  □ nested E2E demo
  □ v3 + Route Folders docs
  □ playground
  □ feedback: Lit / Vaadin circles only

Фаза 1 — launch 1.0 (1–2 мес)
  □ killer MPA→SPA repo + GIF
  □ dev.to + Lit + Vaadin migration
  □ npm + README hero
  □ «Lit Router vs Aura» (честно)

Фаза 2 — traction (3–12 мес)
  □ Astro/Express starters
  □ 2–3 case studies
  □ talk: HTML-first routing after Vaadin
  □ prefetch LCA-delta demo

Фаза 3 — sustain
  □ enterprise support landing
  □ DevTools (optional)
  □ @aura/router-hooks community pack
```

---

## Чего не делать

| ❌ | Почему |
|----|--------|
| «Aura vs TanStack» как главный narrative | проигрыш по умолчанию |
| Охота на React-devs | inertia |
| 100% parity до launch | curiosity не дождётся |
| Generic «best router» SEO | нет diff |
| Платный core | убивает adoption |

---

## Риски

| Риск | Митигация |
|------|-----------|
| Lit Router stable | HTML + MPA→SPA + lifecycle moat |
| HTMX «good enough» | nested dashboard + prefetch partials |
| Solo maintainer burnout | enterprise support early |
| Окно Vaadin закрывается | migration guide + timing |

---

## Итог

| Вопрос | Ответ |
|--------|--------|
| Есть ли будущее? | **Да** — WC + HTML + MPA→SPA + post-Vaadin |
| Масштаб? | Тысячи в нише — реалистично |
| Быстрее всего? | 1 demo + Lit/Vaadin + migration |
| Деньги? | Support / migration, не npm Pro |

---

## Приложение A: Hero для README / landing

### Headline (варианты)

1. **Nested routes in HTML. MPA→SPA without React.**
2. **Server sends partials. Aura wires the SPA.**
3. **Declarative routing for Web Components — after Vaadin.**

### Subhead (RU)

> Маршруты в разметке, nested dashboard из server HTML fragments, lifecycle hooks как у data router — без React runtime.

### Hero code block (15 сек понять продукт)

```html
<aura-router enter="auth">
  <aura-outlet/>

  <aura-route path="/app" preserve>
    <template data-route-shell>
      <nav>
        <a href="dashboard" data-router-link>Dashboard</a>
        <a href="users" data-router-link>Users</a>
      </nav>
      <aura-outlet/>
    </template>
    <aura-route path="dashboard" view="html-src:/partials/dashboard.html"/>
    <aura-route path="users" view="html-src:/partials/users.html"/>
  </aura-route>
</aura-router>
```

```typescript
// main.ts
import { AuraRouter } from 'aura-ui-router';
import { authHook } from '@aura/router-hooks/auth';

AuraRouter.use(authHook, { redirect: '/login' });
```

### 3 bullets под hero

- **HTML-first** — route tree в разметке; SSR и CMS-friendly
- **MPA→SPA** — `view="html-src:…"` подгружает server partials, не JSON loaders
- **Route Folders** — sidebar не мигает при sibling nav; auth на весь раздел

### CTA row

```text
[ Try in Playground ]  [ MPA→SPA demo repo ]  [ Docs: 15-min start ]
```

### Social proof placeholder

```text
Migrating from Vaadin Router? → Migration guide
Compare with Lit Router → honest comparison
```

### Anti-patterns для landing (не писать)

- «Better than React Router»
- «Type-safe like TanStack» (пока нет)
- «Works for everyone»

---

## Приложение B: Outline — Vaadin Router → Aura migration

> Черновик структуры guide для launch. API mapping — уточнять при 1.0.

### 1. Зачем мигрировать

- Vaadin Router deprecated
- Aura: HTML routes, SSR, richer lifecycle
- Что **не** мигрируется 1:1: LitElement-specific observers → hooks

### 2. Quick mapping

| Vaadin Router | Aura Router |
|---------------|-------------|
| `router.setRoutes([{ path, component }])` | `<aura-route path="…" view="component:…">` |
| `action` (async before enter) | `enter="hook-name"` |
| `BeforeEnterObserver` on component | `AuraRouter.use(guardHook)` |
| `commands.redirect('/x')` | hook `return '/x'` или `redirect="…"` |
| `commands.prevent()` | hook `return false` |
| `BeforeLeaveObserver` | `leave="confirm"` |
| `AfterEnterObserver` | `after="analytics"` (`ctx.phase === 'entered'`) |
| DOM outlet / `component` | `<aura-outlet>` + `view` / `layout` |
| Nested routes | Route Folders — [NESTED_ROUTES_JOY_MODEL.md](./NESTED_ROUTES_JOY_MODEL.md) |

### 3. Пошаговая миграция

```text
Step 1 — Flat routes
  Vaadin: setRoutes([{ path: '/home', component: 'x' }])
  Aura:   <aura-route path="/home" view="component:x"/>

Step 2 — Guards
  Vaadin: action / BeforeEnterObserver
  Aura:   enter hook + AuraRouter.use()

Step 3 — Nested layout
  Vaadin: parent component with slot/outlet
  Aura:   folder + layout template или colocated <template data-route-shell>

Step 4 — html-src (optional upgrade)
  Server partials вместо dynamic import component

Step 5 — Lifecycle parity
  leave, reenter, prefetch on links
```

### 4. Пример side-by-side

**Vaadin:**

```javascript
router.setRoutes([
  {
    path: '/users',
    component: 'user-list',
    action: async () => { await import('./user-list.js'); },
  },
]);
```

**Aura:**

```html
<aura-route path="/users" view="component:user-list" enter="auth"/>
```

### 5. Checklist перед prod

- [ ] Все paths перенесены в HTML tree
- [ ] Guards → hooks registry
- [ ] Outlet / nested протестирован sibling nav
- [ ] 404 route (`path="*"`)
- [ ] SSR strategy (active branch в outlet) если SEO-critical

### 6. FAQ migration

| Вопрос | Ответ |
|--------|--------|
| Нужен Lit? | Нет — vanilla WC; Lit adapter optional |
| Где типы? | v3 attrs; TS codegen — позже |
| Dynamic addRoute? | P1; сейчас HTML tree + refreshRoutes |

### 7. CTA в конце guide

```text
[ Playground ] · [ Open migration issue ] · [ Enterprise migration support ]
```

---

## Связанные документы

- [COMMERCIAL_MODEL.md](../COMMERCIAL_MODEL.md) — monetization detail
- [COMPETITORS.md](../COMPETITORS.md) — Vaadin / Lit comparison
- [FEATURE_PARITY_ROADMAP.md](../comparison/FEATURE_PARITY_ROADMAP.md) — adoption probabilities

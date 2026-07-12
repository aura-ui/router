# SSR & MPA → SPA — стратегия и границы ответственности

> **Статус:** design / decision record (2026-06-30)  
> **Публичный roadmap:** только **MPA → SPA** (client hydration) — [ROADMAP.md](../../ROADMAP.md) Phase 8.  
> **SSR runtime на Node** — исследование ниже; **не обещаем** в roadmap.  
> **Связь:** [README.md](../../README.md) · [WC_RECOMMENDATIONS.md](../WC_RECOMMENDATIONS.md)

Зафиксировать выводы дискуссии: **нужен ли Aura на сервере**, что он делает с HTML, и когда достаточно client-only hydration.

---

## Что в roadmap, что нет

| Подход | Roadmap | Этот документ |
|--------|---------|----------------|
| **MPA → SPA** — сервер отдаёт `.html`, Aura в браузере | ✓ Phase 8 (8.1–8.4) | § MPA → SPA |
| **SSR runtime** — `renderAuraRoute()`, Fastify glue | ✗ не обещаем | § SSR runtime (исследование) |

---

## MPA → SPA (публичный roadmap)

Если сервер **уже умеет отдавать HTML**, логично спросить: не достаточно ли вставить в layout `<aura-router>` с путями и подключить client bundle?

**Часто — да.** Aura на сервере **не обязательна** для adoption path из roadmap.

Ниже — когда **исследовательский** SSR runtime мог бы понадобиться (если когда-нибудь вернёмся к теме):

1. **Один SPA-shell** (`index.html`) на все URL — без SSR первый экран пустой до JS + fetch.
2. **Один `<aura-route>` tree** — источник правды и на сервере, и в клиенте (без дублирования в nginx/шаблонизаторе).
3. **Server-side guards** — redirect до отдачи HTML (auth).
4. **Server-side `load`** — данные в первом ответе без отдельного API round-trip.
5. **Nested layouts** — сборка layout + child outlet из одного определения маршрутов.

Если URL = один статический `.html` и контент уже в файле — **достаточно MPA → SPA из roadmap**.

---

## MPA → SPA — поток (roadmap)

```text
GET /users
  → nginx / Express static → users.html (полная страница, готовый контент)
  → в layout уже есть <aura-router> + client.js
  → AuraRouter.install() — дальше клики по data-router-link без полной перезагрузки
```

### Кто за что отвечает

| Слой | Роль |
|------|------|
| **Сервер** (nginx, PHP, EJS, CMS) | Отдаёт готовые `.html`; может вставить общий partial с `<aura-router>` |
| **Aura (клиент)** | Match, guards, load, view loaders, outlet, SPA-навигация |
| **Aura (сервер)** | **Не используется** |

### Плюсы

- Максимальная скорость отдачи (чтение файла / кэш CDN).
- Нет лишней прослойки на Node.
- Естественный путь для существующих MPA и CMS.

### Минусы / ограничения

- Маршруты и разметка могут дублироваться между server layout и `<aura-route>` (если нет единого шаблона).
- Сложные маршруты (`:id`, nested, guard) на сервере всё равно решаются шаблонизатором или отдельной логикой.
- Первый заход на **единый** SPA entry (`index.html` на все пути) без SSR — пустой outlet до JS.

### Минимальный пример

```html
<!-- users.html — отдаёт сервер как сегодня -->
<!doctype html>
<html>
<body>
  <nav><a href="/" data-router-link>Home</a> <a href="/users" data-router-link>Users</a></nav>
  <main>
    <h1>Users</h1>
    <ul>...</ul>
  </main>

  <aura-router>
    <aura-route path="/" view="home.html"></aura-route>
    <aura-route path="/users" view="users.html"></aura-route>
  </aura-router>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

```ts
// app.js
import { AuraRouter } from '@aura-ui-web/router';
AuraRouter.install();
```

Сервер **не вызывает** Aura — только отдаёт файлы.

---

## SSR runtime (исследование — не в roadmap)

> Заметки на будущее. Не коммитим как публичное обещание.  
> **Отдельный server navigation path** (redirect, load, HTTP 302 vs client walk) — ⚠️ под вопросом: [SSR_SERVER_NAVIGATION_PATH.md](./SSR_SERVER_NAVIGATION_PATH.md).

### Поток

```text
GET /users/42
  → Fastify plugin
  → renderAuraRoute({ url, cookies })
       match → guard → load → read pages/user.html → compose outlet
  → HTML shell + заполненный <aura-outlet> + __AURA_SSR__ payload
  → клиент: hydrate без повторного fetch
```

### Кто за что отвечает

| Слой | Роль |
|------|------|
| **HTTP (Fastify/Express)** | Cookies, static, TLS — **не знает** про `<aura-route>` |
| **`renderAuraRoute()`** | Match, pipeline, view loaders на Node, сборка документа |
| **View loaders** | `html-src` читает partial; `html` / `template` — inline / clone |
| **Клиент** | Hydration + SPA nav |

### Что Aura «рендерит» vs «подтягивает»

| `view` | На сервере |
|--------|------------|
| `pages/user.html` / `html-src::…` | **Читает готовый файл** с диска / через Node `fetch` |
| `html::<h1>…</h1>` | Строка из attr |
| `template::404` | Клон `<template>` из shell |
| `load="fetch-user"` | JSON; HTML отдельно (или кастомный loader собирает строку) |
| `component-src` / Lit WC | **Не базовый v0.1** — нужен отдельный SSR компонентов |

**Итог:** SSR для Aura — в первую очередь **composition** (shell + partial + payload), не замена React/Vue SSR.

### Плюсы

- Один route tree для server + client.
- First paint для SPA-shell с контентом.
- Guards/load на сервере в той же модели.

### Минусы

- CPU на запрос (match + hooks + IO) vs статика.
- Сложнее dev/prod paths (Vite, assets).
- Не нужен для классического MPA с файлом на URL.

---

## Производительность

| Подход | Стоимость запроса |
|--------|-------------------|
| nginx → `users.html` | ~O(1) IO, минимум CPU |
| Шаблонизатор (EJS, PHP) | CPU + IO; уже принят в проекте |
| Aura `renderAuraRoute()` | match + guards + load + read partials + assemble |

**Вывод:** Aura SSR — не «прокси ради прокси», а замена **ручной** сборки HTML на Node. Если сборка не нужна — используй **8a**.

---

## Fastify architecture sketch

Три слоя — **не один god-handler**:

```text
┌─────────────────────────────────────┐
│  Fastify plugin (~30 строк)        │  req.url → aura.render()
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  renderAuraRoute() / createAuraSsr  │  framework-agnostic core
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Engine pipeline (match→guard→load) │  тот же контракт, что в браузере
└─────────────────────────────────────┘
```

### Core (целевой API, пока не в коде)

```ts
const aura = await createAuraSsr({
  shellPath: 'public/index.html',
  publicDir: 'public/',
  hooks: { auth: authHook },
  loaders: { 'fetch-user': fetchUserLoader },
});

const result = await aura.render('/users/42', { cookies });
// { status, html, payload }
```

### Fastify glue

```ts
app.get('/*', async (req, reply) => {
  const result = await app.aura.render(req.url, { cookies: req.cookies });
  if (result.status === 302) return reply.redirect(result.headers!.Location!);
  return reply.code(result.status).type('text/html').send(result.html);
});
```

Разные стеки (Express, Vite dev, serverless) отличаются только **обвязкой** и `publicDir`/`fetch` — не ядром pipeline.

---

## Decision matrix

| Ситуация | Рекомендация |
|----------|--------------|
| Сайт уже MPA, каждый URL = `.html` | **MPA → SPA** (roadmap) |
| CMS/PHP генерирует HTML | **MPA → SPA** + shared layout partial |
| Один `index.html`, client routing | SSR runtime *(исследование)* или empty first paint |
| Auth redirect до HTML | SSR runtime *(исследование)* или server template |
| Nested routes + один route tree | SSR runtime *(исследование)* или шаблонизатор |
| Максимальный TTFB, CDN static | **MPA → SPA** (roadmap) |

---

## Связь с roadmap

| Roadmap Phase 8 | Этот документ |
|-----------------|---------------|
| 8.1–8.4 | § MPA → SPA |
| — | § SSR runtime (исследование) — **вне roadmap** |

---

## Открытые вопросы

- [ ] Единый shared partial для MPA → SPA (npm snippet / docs recipe)?
- [ ] Минимальный контракт `__AURA_SSR__` payload — только если вернёмся к SSR runtime?
- [ ] `component-src` SSR — отдельная тема?
- [ ] Пример Phase 8: nginx config vs Express `@fastify/static`?

---

## Резюме одной строкой

**Сервер может отдавать HTML без Aura — это путь из roadmap. SSR runtime на Node остаётся в todo как исследование, без публичного обещания.**

# Document-first + WC: продуктовая ставка Aura

> **Статус:** стратегический ориентир · **2026-07-13**  
> **См.:** [adr/GREENFIELD_NAVIGATION_MODEL.md](../adr/GREENFIELD_NAVIGATION_MODEL.md) · [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md) · [SSR_MPA_STRATEGY.md](./SSR_MPA_STRATEGY.md) · [ADOPTION_AND_GTM.md](./ADOPTION_AND_GTM.md)

---

## TL;DR

Aura выигрывает не как «ещё один data-router для React», а как роутер, где **маршрут = документ (HTML fragment) + данные + WC-острова**.

**«Дожать document-first»** — сделать `html-src`, tiered prefetch и MPA→SPA **главным сценарием** продукта и engine, а не side feature рядом с копией TanStack.

Без этого transaction/guard/prepare — хороший engine **без явного покупателя**.

---

## Два пути

| | Путь A: generic SPA router | Путь B: document-first WC (**ставка**) |
|---|---------------------------|----------------------------------------|
| Модель | guard → JSON loader → WC shell | route = **html fragment** + meta data + islands |
| Конкуренты | TanStack, RR7 | HTMX, Turbo, legacy MPA |
| Исход | догон по types/ecosystem | ниша, где топ-роутеры слабы |

---

## Что значит document-first (конкретно)

### 1. Маршрут описывает документ, не только компонент

```html
<aura-route
  path="/users/:id"
  source="html-src"
  data-content="/fragments/users/{id}.html"
  load="user-meta"
  guard="session"
/>
```

| Слой | Роль |
|------|------|
| `html-src` | **тело страницы** — partial HTML с сервера |
| `load` | **метаданные** — JSON (title, guard hints, списки) |
| `view` / WC | **острова** — интерактив поверх HTML |

У RR/TanStack нет first-class «fetch HTML fragment по маршруту» — UI = компонент, данные = loader.

### 2. Prepare = два типа груза

```text
data    — лёгкий JSON
content — тяжёлый HTML (html-src)
module  — JS WC / dynamic import
```

На **click** — параллельно где можно. На **hover** — в основном data, не html ([PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md)).

### 3. MPA → SPA без big-bang

```text
Было:  users.html, users/1.html — целые страницы с сервера
Стало: layout shell + aura-route подгружает фрагменты в outlet
       URL и CMS-шаблоны остаются server-driven
```

### 4. Commit gate под документ

View меняется через outlet (fragment mount), не virtual DOM reconcile. Cancel до commit — старый документ на экране (критично для тяжёлого html).

### 5. Lifecycle под WC + документ

`leave` / `unmount` / transitions / param remount — teardown WC **внутри** фрагмента.

---

## Tiered prefetch (document-first политика)

| Триггер | Что грузить | Почему |
|---------|-------------|--------|
| hover | **data** (JSON) | мало, ~80% hover не клик |
| tap / pointerdown | data + **html** (опционально) | высокий confidence |
| click | всё + render | cache hit из speculative |

Default: `html-src` → `prefetchOn: tap` или `prefetch="false"`, не hover на каждую ссылку.

---

## Сравнение с миром

| | HTML fragments first-class | WC native | Tiered prefetch |
|---|---------------------------|-----------|-----------------|
| **Aura (цель)** | ✓ | ✓ | data hover / html tap |
| TanStack / RR7 | ✗ | ✗ | data only |
| HTMX | ✓ partials | ✗ | click swap |
| Turbo | full page | ✗ | prefetch page |
| SvelteKit | server HTML | ✗ | preload data |

**Уникальная зона:** HTMX-like partials + SPA nested outlet + WC lifecycle + intent prefetch **без React**.

---

## Если не дожать

| Симптом | Следствие |
|---------|-----------|
| `html-src` сырой, cache кривой | document-first только в README |
| Примеры только `component-src` + fetch в WC | ≈ Lit-router + loader |
| Prefetch только JSON, html всегда в render | теряется ROI parallel prepare на click |
| Гонка за parity с TanStack | вечный догон |

---

## Чеклист «дожать»

### Продукт

- [ ] Happy path demo: `html-src` + nested outlet + layout
- [ ] MPA→SPA demo (3–5 страниц, server fragments)
- [ ] Док: когда `html-src` vs WC-only vs `load`

### Engine

- [ ] Prepare: data ∥ content на **click** (graph или минимум parallel)
- [ ] Tiered prefetch: data hover, html tap — [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md)
- [ ] Единый cache: prefetch ↔ navigation один ключ
- [ ] Speculative pipeline + guard lite — [GREENFIELD_NAVIGATION_MODEL.md](../adr/GREENFIELD_NAVIGATION_MODEL.md) этап 1–2

### Server / SSR (story)

- [ ] Как сервер отдаёт fragment + hydrate WC внутри
- [ ] 401 на protected fragment без session
- [ ] Связь с [SSR_MPA_STRATEGY.md](./SSR_MPA_STRATEGY.md)

### DX

- [ ] HTML attrs как primary API: `source`, `data-content`, `cache`, `prefetch`
- [ ] Простые MPA-маршруты без TS route config

---

## Целевая аудитория

| Аудитория | Нужен document-first? |
|-----------|----------------------|
| Уже React SPA | нет — TanStack/RR |
| Legacy MPA, CMS, static HTML, постепенный SPA | **да** — ставка Aura |
| HTMX-подобные partials + nested SPA | **да** |

---

## Связь с greenfield ADR

Transaction + guard + prepare + speculative — **инфраструктура** для document-first, не самоцель.

| ADR | Document-first |
|-----|----------------|
| Resource graph | data ∥ content на click |
| Speculative mode | hover = data only |
| History до prepare | новый URL + loader на fragment fetch |
| Guard lite on prefetch | protected html не в cache без gate |

---

## Формула

> **Document-first** = маршрут про **какой HTML-кусок и какие данные** в outlet.  
> **WC-first** = без обязательного React.  
> **Дожать** = сделать это **главным сценарием**, а не экспериментом.

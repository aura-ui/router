# TODO: зрелый data / SWR слой (parity vs TanStack / RR7)

> **Сверка с кодом:** 2026-06-30  
> **Статус:** DataGraph **v1 в коде**; полный product-parity с data router — **~ частично**  
> **Связь:** [DATAGRAPH.md](./DATAGRAPH.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) · [PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md)

---

## О чём речь

**«Зрелый data/SWR слой»** — не про prefetch-каскад (`link → route → router`), а про то, **как роутер кэширует и обновляет данные маршрута** при навигации и prefetch.

Два независимых cache-track в Aura:

| Слой | Что кэширует | Код | SWR при navigation |
|------|----------------|-----|-------------------|
| **DataGraph** | `load` hooks (JSON, store) | `core/data-graph/` | ✓ `staleTime` 30s по умолчанию + фоновый refetch |
| **Content / DataCache** | view (`html-src`, template…) | `core/content/cache/` | ~ тот же `AuraResolvableCache`, но **без `staleTime`** → hit/miss + dedupe, без stale+revalidate |

Оба слоя сидят на **`AuraResolvableCache`** (`aura-cache-store`). SWR включается только когда задан `staleTime` (см. `AuraResolvableCache.resolve()`). DataGraph задаёт его в ctor; `DataCache` — нет (только `max` + `gcTime: Infinity`), поэтому повторный визит = **вечный cache hit**, а не «показать stale + тихий refetch».

Опционально: `AuraRouter.configure({ dataCache: { staleTime: 30_000 } })` — SWR для view **можно** включить, но это не дефолт и не покрыто product-DX (per-route TTL, invalidate).

---

## SWR (Stale-While-Revalidate) — что это

Паттерн из TanStack Router, Remix/React Router 7, SvelteKit:

```text
fresh   → отдать кэш, fetch не нужен
stale   → отдать кэш сразу + тихий refetch в фоне
missing → await fetch → записать в кэш → отдать
```

**Зачем:** повторный визит на route не блокируется пустым экраном — пользователь видит последние данные, UI обновляется после refetch.

В Aura инфраструктура SWR живёт в `aura-cache-store` (`AuraResolvableCache` + `lookup` fresh/stale/missing). DataGraph использует её; view `DataCache` — по умолчанию нет.

---

## Что уже есть (2026-06-30)

### DataGraph v1 — <span style="color:#16a34a">в коде</span>

- Вызов в `ProcessorPipeline.runLoads()` после guards, до render
- Parallel sibling loads + sibling abort на redirect/cancel
- `AuraResolvableCache` с `staleTime` (default 30s), `gcTime`
- LCA snapshot: parent вне `enterRoutes` → данные из кэша без повторного hook fetch
- `prefetch()` intent (без guards; redirect/error — silent)
- `DataPrefetchExecutor` в `PrefetchPipeline`
- `invalidate()` / `invalidateMatch()` / `invalidateAll()`
- `preserve="data"` на route
- Тесты: `test/data-graph/data-graph.test.ts`

### Prefetch config — <span style="color:#16a34a">в коде</span>

Каскад **когда** греть (ортогонален data/SWR):

```text
data-prefetch (link)  →  prefetch (route)  →  prefetch (router)
```

Подробнее: [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md) (hover vs tap, не «intent+tap» в attr).

---

## Чего не хватает до «как у лидеров»

| Возможность | TanStack / RR7 | Aura |
|-------------|----------------|------|
| Loader cache + базовый SWR | ✓ | ✓ DataGraph |
| **`shouldRevalidate`** — решать per-navigation, обновлять ли | ✓ route / loader | ✗ |
| **`staleTime` / `gcTime` per route** | ✓ | только global на `DataGraph` ctor |
| **`router.invalidate()`** публичный DX после мутации | ✓ | DataGraph API есть; слабый фасад на `<aura-router>` |
| SWR на **view** (`html-src`) при navigation | частично | ~ infra есть; **дефолт без `staleTime`** → нет revalidate-on-stale |
| Единый cache graph prefetch ↔ nav + revalidate UX | ✓ | content ✓ hit; data ~ SWR |
| **`cause: 'preload' \| 'enter'`** в loader context | ✓ | ✗ в hook context |
| Devtools: fresh / stale / miss | ✓ | ✗ [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) |
| Reenter load policy (minimal revalidate) | ✓ | ~ shortcut без полного load; политика не формализована |

**Итог:** база data+SWR для `load` hooks **есть**; «зрелость» — про **политики, DX и observability**, а не про отсутствие DataGraph.

---

## Пример «зрелого» UX (цель)

```text
1-й визит /users     → fetch load hook → render
2-й визит < 30s      → snapshot из кэша, hook не дергаем     ✓ сейчас
2-й визит > 30s      → показать stale + фоновый refetch       ✓ DataGraph (SWR)
POST /users (create) → router.invalidate('/users')            ~ API есть, DX слабый
Sibling /users → /users/1 → parent load из LCA cache         ✓ snapshot
html-src partial     → stale HTML + quiet refetch             ✗ TODO content track
```

---

## Roadmap (приоритет)

### P1 — parity с data router

| # | Задача | Effort |
|---|--------|--------|
| 1 | `router.invalidate(keys?)` / `invalidateAll()` на `<aura-router>` | ~0.5 дн |
| 2 | Per-route `staleTime` / `gcTime` (attr или route config) | ~1 дн |
| 3 | **`shouldRevalidate`** (route attr или hook policy) | ~2–3 дн |
| 4 | `cause` в `RouteLifecycleContext` для load (`enter` vs `prefetch`) | ~1 дн |

### P2 — content track + tooling

| # | Задача | Effort |
|---|--------|--------|
| 5 | SWR на `DataCache` по умолчанию (`staleTime` + per-route TTL для `preserve.view`) | ~1–2 дн |
| 6 | Reenter: явная политика load (skip / always / revalidate-if-stale) | ~1 дн |
| 7 | [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) — события prefetch/load hit/miss/stale | ~2 дн |

### P3 — polish

| # | Задача |
|---|--------|
| 8 | Typed cache keys / deps в `buildRouteDataKey` |
| 9 | Unified invalidation: data + content по pattern |
| 10 | E2E: hover prefetch data → click → 0 duplicate network |

---

## Критерии «зрелый слой» (Definition of Done)

- [ ] App после mutation вызывает один понятный API (`router.invalidate`)
- [ ] Route может задать TTL и `shouldRevalidate` без global-only config
- [ ] Navigation на stale data не блокирует UI (SWR) для **load** и опционально **view**
- [ ] Prefetch и navigation делят store; повторный click = cache hit
- [ ] Devtools или debug events: `fresh` / `stale` / `miss` per key
- [ ] Документация и пример в demo (users list + create + invalidate)

---

## Связанные документы

| Документ | Тема |
|----------|------|
| [DATAGRAPH.md](./DATAGRAPH.md) | Архитектура DataGraph (обновить статус реализации) |
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | View cache, SWR для html-src |
| [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) | Когда греть (prefetch intent) |
| [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) | Оценка prefetch vs мир |
| [../comparison/ENGINE_ARCHITECTURE_COMPARISON.md](../comparison/ENGINE_ARCHITECTURE_COMPARISON.md) | Engine + DataGraph в сводке |

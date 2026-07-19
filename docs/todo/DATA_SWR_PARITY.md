# TODO: зрелый data / SWR слой (parity vs TanStack / RR7)

> **Статус:** <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ В ПРОЦЕССЕ</span> — DataGraph v1 + SWR ✓ · product-parity ✗  
> **Сверка с кодом:** 2026-07-19  
> **Связь:** [DATAGRAPH.md](./DATAGRAPH.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) · [PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) · [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md)

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | каркас есть, не до конца |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> | сознательно не в scope |

### Сводка прогресса

| Блок | Статус | Что дальше |
|------|--------|------------|
| DataGraph v1 + SWR (`staleTime` 30s) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | закрыт |
| Prefetch ↔ nav shared store | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| `router.invalidate()` (+ `data-invalidated`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | unified data+view — отдельно |
| Global `configure({ dataCache })` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Per-route `staleTime` / `gcTime` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | attr / route config |
| `shouldRevalidate` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | per-navigation policy |
| `cause` в hook context | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | enter vs prefetch |
| View navigation SWR (default) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [CONTENT_CACHE.md](./CONTENT_CACHE.md) |
| Reenter load policy | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | shortcut есть; политика не формализована |
| Devtools / debug events | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) |
| Demo: mutate → invalidate | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | product DX |

---

## О чём речь

**«Зрелый data/SWR слой»** — не про prefetch-каскад (`link → route → router`), а про то, **как роутер кэширует и обновляет данные маршрута** при навигации и prefetch.

Два независимых cache-track в Aura:

| Слой | Что кэширует | Код | SWR при navigation |
|------|----------------|-----|-------------------|
| **ViewPayloadCache** | view loaders (`url`, `html`, …) | `core/view-graph/` | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> hit/miss + dedupe; SWR через `configure({ viewCache: { staleTime } })` |
| **DataGraph** | `load` hooks (JSON, store) | `core/data-graph/` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `staleTime` 30s по умолчанию + фоновый refetch |

Оба слоя сидят на **`AuraResolvableCache`** (`aura-cache-store`). SWR включается только когда задан `staleTime` (см. `AuraResolvableCache.resolve()`). DataGraph задаёт его в defaults; ViewPayloadCache — **нет** (только `max` + `gcTime`), поэтому повторный визит view = **cache hit без quiet refetch**, пока не включить `viewCache.staleTime`.

Опционально: `AuraRouter.configure({ viewCache: { staleTime: 30_000 } })` — SWR для loader payload **можно** включить, но это не дефолт и не покрыто product-DX (per-route TTL).

---

## SWR (Stale-While-Revalidate) — что это

Паттерн из TanStack Router, Remix/React Router 7, SvelteKit:

```text
fresh   → отдать кэш, fetch не нужен
stale   → отдать кэш сразу + тихий refetch в фоне
missing → await fetch → записать в кэш → отдать
```

**Зачем:** повторный визит на route не блокируется пустым экраном — пользователь видит последние данные, UI обновляется после refetch.

В Aura инфраструктура SWR живёт в `aura-cache-store` (`AuraResolvableCache` + `lookup` fresh/stale/missing). DataGraph использует её; view track — по умолчанию нет.

---

## Что уже есть (2026-07-19)

### DataGraph v1 — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

- Вызов в `NavigationTransactionPipeline.runLoads()` после guards, до render
- Parallel sibling loads + sibling abort на redirect/cancel
- `AuraResolvableCache` с `staleTime` (default 30s), `gcTime`
- LCA snapshot: parent вне `enterRoutes` → данные из кэша без повторного hook fetch
- `prefetch()` intent (без guards; redirect/error — silent)
- `DataPrefetchExecutor` в `PrefetchPipeline`
- `invalidate()` на DataGraph / ResourceGraph; публичный `router.invalidate()` + `data-invalidated`
- `AuraRouter.configure({ dataCache: { max, staleTime, gcTime } })`
- `cache="data"` на route
- Тесты: `test/data-graph/data-graph.test.ts`

### Prefetch config — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

Каскад **когда** греть (ортогонален data/SWR):

```text
data-prefetch (link)  →  prefetch (route)  →  prefetch (router)
```

Подробнее: [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md) (hover vs tap, не «intent+tap» в attr).

---

## Чего не хватает до «как у лидеров»

| Возможность | TanStack / RR7 | Aura | Статус |
|-------------|----------------|------|--------|
| Loader cache + базовый SWR | ✓ | ✓ DataGraph | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **`shouldRevalidate`** — решать per-navigation | ✓ route / loader | нет | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| **`staleTime` / `gcTime` per route** | ✓ | только global `configure({ dataCache })` / defaults | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| **`router.invalidate()`** публичный DX | ✓ | ✓ data; view — `invalidateView()` отдельно | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |
| SWR на **view** при navigation | частично | infra есть; **дефолт без `staleTime`** | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Единый cache graph prefetch ↔ nav | ✓ | content ✓ hit; data ✓ SWR | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **`cause: 'preload' \| 'enter'`** в loader context | ✓ | нет в `RouteLifecycleContext` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Devtools: fresh / stale / miss | ✓ | нет | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Reenter load policy | ✓ | ~ shortcut без полного load | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |

**Итог:** база data+SWR для `load` hooks **есть**; «зрелость» — про **политики, per-route TTL, observability**, а не про отсутствие DataGraph.

---

## Пример «зрелого» UX (цель)

```text
1-й визит /users     → fetch load hook → render                    ✓
2-й визит < 30s      → snapshot из кэша, hook не дергаем           ✓
2-й визит > 30s      → показать stale + фоновый refetch            ✓ DataGraph SWR
POST /users (create) → router.invalidate('/users')                 ✓ API есть; demo ✗
Sibling /users → /users/1 → parent load из LCA cache               ✓
html-src partial     → stale HTML + quiet refetch                  ✗ content track
```

---

## Roadmap (приоритет)

### P1 — parity с data router

| # | Задача | Effort | Статус |
|---|--------|--------|--------|
| 1 | `router.invalidate(keys?)` / scope на `<aura-router>` + `data-invalidated` | ~0.5 дн | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| 2 | Per-route `staleTime` / `gcTime` (attr или route config) | ~1 дн | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| 3 | **`shouldRevalidate`** (route attr или hook policy) | ~2–3 дн | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| 4 | `cause` в `RouteLifecycleContext` для load (`enter` vs `prefetch`) | ~1 дн | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

### P2 — content track + tooling

| # | Задача | Effort | Статус |
|---|--------|--------|--------|
| 5 | SWR на `ViewPayloadCache` по умолчанию (`staleTime` + per-route TTL для `cache.view`) | ~1–2 дн | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| 6 | Reenter: явная политика load (skip / always / revalidate-if-stale) | ~1 дн | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |
| 7 | [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) — события prefetch/load hit/miss/stale | ~2 дн | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

### P3 — polish

| # | Задача | Статус |
|---|--------|--------|
| 8 | Typed cache keys / deps в `buildRouteDataKey` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| 9 | Unified invalidation: data + content по pattern | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| 10 | E2E: hover prefetch data → click → 0 duplicate network | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

---

## Критерии «зрелый слой» (Definition of Done)

> **Легенда:** <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> готово · <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> частично · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> не сделано

- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> App после mutation вызывает один понятный API (`router.invalidate`) — data track; unified data+view ещё нет
- <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Route может задать TTL и `shouldRevalidate` без global-only config
- <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> Navigation на stale data не блокирует UI (SWR) для **load** ✓; для **view** — opt-in / не default
- <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Prefetch и navigation делят store; повторный click = cache hit
- <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Devtools или debug events: `fresh` / `stale` / `miss` per key
- <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Документация и пример в demo (users list + create + invalidate)

---

## Связанные документы

| Документ | Тема |
|----------|------|
| [DATAGRAPH.md](./DATAGRAPH.md) | Архитектура DataGraph (v1) |
| [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) | Пробелы: defer, revalidate, UI на stale |
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | View cache, SWR для html-src |
| [../done/LINK_DRIVEN_PRELOAD.md](../done/LINK_DRIVEN_PRELOAD.md) | Когда греть (prefetch intent) |
| [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) | Оценка prefetch vs мир |
| [../comparison/ENGINE_ARCHITECTURE_COMPARISON.md](../comparison/ENGINE_ARCHITECTURE_COMPARISON.md) | Engine + DataGraph в сводке |

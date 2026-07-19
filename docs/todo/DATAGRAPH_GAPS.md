# DataGraph: что ещё не доделано

> **Статус:** <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> — v1 + ResourceGraph + `parent()` + `invalidate` ✓ · defer / shouldRevalidate / UI-on-stale ✗  
> **Сверка с кодом:** 2026-07-19  
> **База:** `core/data-graph/` · owner prepare [`ResourceGraph`](../../src/modules/aura-routing-engine/core/resource-graph/resource-graph.ts)  
> **См. также:** [../done/DATAGRAPH.md](../done/DATAGRAPH.md) · [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) · [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md) · [../done/RESOURCE_GRAPH_HANDOFF.md](../done/RESOURCE_GRAPH_HANDOFF.md)

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | каркас / opt-in есть, не полный product |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ ОТЛОЖЕНО</span> | сознательно не в scope / by design |

### Сводка прогресса

| # | Тема | Статус | Что дальше |
|---|------|--------|------------|
| — | DataGraph v1 + ResourceGraph prepare | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| — | Prefetch ↔ nav handoff | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | [RESOURCE_GRAPH_HANDOFF](../done/RESOURCE_GRAPH_HANDOFF.md) |
| — | Parallel loads + `ctx.parent()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | [LOAD_DAG](./DATAGRAPH_LOAD_DAG.md) |
| 1 | blocking / defer / revalidate modes | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | blocking ✓ · defer ✗ · per-route policy ✗ |
| 2 | Reenter / same-URL load policy | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | noop / update есть · `reenter-load` attr ✗ |
| 3 | `shouldRevalidate` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | per-navigation fn |
| 4 | `cache="data"` default | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | opt-in + inherit с router ✓ · default-on ✗ |
| 5 | Per-route TTL | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | global `configure({ dataCache })` ✓ |
| 6 | `router.invalidate()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | + `data-invalidated` · unified data+view ✗ |
| 7 | UI на фоновый refresh | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | нет re-render / `data:revalidated` |
| 8 | `cause` в hook ctx | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | enter vs prefetch |
| 9 | View/HTML SWR | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | [CONTENT_CACHE](./CONTENT_CACHE.md) |
| 10 | Load/cache events | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | `data-invalidated` ✓ · hit/miss/load ✗ |
| 11c / 12 | `ctx.parent()` / parent→child | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | opt-in; engine-forced ⊘ |

---

## О чём этот документ

**DataGraph** — слой: *какие данные подтянуть перед показом, что из кэша, что не трогать при nested nav*.

Хуки `load` — сами запросы. DataGraph (+ ResourceGraph) — *когда* вызывать, *что* запомнить, *что* переиспользовать.

Ниже — пробелы и **закрытые** пункты (яркий ✓). Для открытых: что сейчас, зачем, целевое.

---

## Что уже работает — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ v1</span>

| Уже есть | Простыми словами | Статус |
|----------|------------------|--------|
| `ResourceGraph.load` | Единый вход prepare (nav + prefetch) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Resource waves | data ‖ independent view → viewWithData | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Handoff (~30s) | hover→click join без второго fetch | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `DataGraph.load` | Blocking enter loads до render | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Parallel + `ctx.parent()` | Default parallel; join opt-in | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| LCA / nested | Parent вне enter — из cache/handoff | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Long `cache.data` | Opt-in `cache="data"` / inherit с router | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `router.invalidate()` | Публичный API + `data-invalidated` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `configure({ dataCache })` | Global staleTime / gcTime / max | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Snapshot → render | `transaction.dataSnapshot` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Тесты | `data-graph.test.ts`, `resource-graph*.test.ts`, `invalidate.test.ts` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

> **Нюанс SWR:** `AuraResolvableCache.resolve()` умеет stale→фон. Navigation path DataGraph сейчас читает long cache через `get`/`set` (hit до GC / invalidate), не полный age-based quiet refetch. Handoff — TTL join без SWR. Подробнее — [DATA_SWR_PARITY](./DATA_SWR_PARITY.md).

---

## 1. Разные режимы загрузки — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

### Статус по режимам

| Режим | Статус | Сейчас |
|-------|--------|--------|
| **blocking** | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | Все enter `load` ждут до render |
| **defer** | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | Нет load после commit / skeleton |
| **revalidate** (per-route policy) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | Нет выбора «на этом узле только кэш» |
| Long cache hit | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | при `cache="data"` — `get` без сети |
| UI после фонового refresh | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | п. 7 |

### Сейчас в коде

Любой navigation `load` — **blocking**: `runLoads` → `ResourceGraph.load` → await data (+ view plan) → потом render. Per-route «жди / отложи / только обнови» — нет.

| Что | Статус |
|-----|--------|
| Blocking enter loads | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Handoff / prefetch warmup | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Режим **defer** | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Per-route blocking vs revalidate | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `shouldRevalidate` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> (п. 3) |
| UI после фона | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> (п. 7) |

### Зачем

| Режим | Смысл | Пример | Статус |
|-------|-------|--------|--------|
| **blocking** | Без данных нельзя показать | Права, редирект | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| **defer** | Каркас сразу, данные после commit | Тяжёлый сайдбар | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| **revalidate** | Политика на узле: кэш + фон | Список при Back | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

```text
aura-cache-store / handoff  = КАК хранить / join
политика на маршруте        = КОГДА ждать / отложить / только кэш   ← пробел
```

> **Defer:** load неблокирующий → skeleton → подстановка (нужен п. 7). Не путать с handoff prefetch.

### Prefetch vs defer — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> контуры разведены

| Когда | Кто | Как |
|-------|-----|-----|
| Hover / intent | PrefetchPipeline → `ResourceGraph.load` (`phaseMode: 'prefetch'`) | warmup + handoff, без guards |
| Клик, prepare | Pipeline → `ResourceGraph.load` (`navigation`) | await data ‖ view → viewWithData → render |
| Defer после commit | — | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

```text
prefetch  = раньше (hover → handoff/cache)
blocking  = ждать до commit          ✓
defer     = позже (commit → skeleton) ✗
```

---

## 2. Повторный заход на тот же URL (reenter) — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

### Сейчас — <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span>

| Ситуация | Поведение | Статус |
|----------|-----------|--------|
| Exact same URL / already-active | Coordinator → `noop` (pipeline не бежит) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (жёстче, чем «только reenter hooks») |
| Param/query change, тот же leaf | `update` → `runUpdate` / `runLoads` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Политика `reenter-load`: skip / always / if-stale | attr / configure | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

Post-commit lifecycle phase в коде — **`update`** (не attr `reenter="…"` как load-policy).

### Цель (ещё нет)

| Режим | Смысл |
|-------|--------|
| **skip** | Не трогать DataGraph (близко к текущему noop) |
| **always** | Снова `ResourceGraph.load` |
| **if-stale** | Протух → refetch (нужна реальная stale-семантика + п. 7) |

Предложение API: default на router + override на route (`reenter-load`), отдельно от lifecycle hooks. Приоритет с `shouldRevalidate` — см. п. 3.

---

## 3. `shouldRevalidate` — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

### Сейчас

Такой функции **нет**. Решение: enter → load; иначе long-cache `get` / handoff / сеть.

Императивно после мутации — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> `router.invalidate()` (п. 6). Это **не** замена `shouldRevalidate(from, to)`.

### Зачем

Таймер / invalidate не покрывают «при Back — нет, после POST — да, при смене query — да».

| | Вопрос | Статус |
|--|--------|--------|
| `cache="data"` | кэшировать ли | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| prefetch | греть до клика | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `reenter-load` (п. 2) | same-URL | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| **`shouldRevalidate`** | этот переход from→to | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| `router.invalidate()` | императивно испортить кэш | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |

### Цель

```ts
shouldRevalidate: ({ from, to, action }) => { … }
```

Иерархия (предложение):

```text
router.invalidate()      — ✓ есть
shouldRevalidate(fn)     — ✗
reenter-load (attr)      — ✗ (п. 2)
cache="data"             — ✓
```

---

## 4. `cache="data"` только opt-in — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

| Что | Статус |
|-----|--------|
| Opt-in `cache="data"` / `cache="all"` на route | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Inherit с `<aura-router cache="data">` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Default-on для всех routes с `load` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> / продуктовый вопрос |
| Документация + nested examples | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |

Без флага — каждый enter бьёт в hook (handoff всё ещё может join in-flight).  
С флагом / inherit — long cache + LCA reuse.

Открытый вопрос: оставить opt-in или default-on.

---

## 5. Свой TTL на маршрут — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

| Что | Статус |
|-----|--------|
| Global `AuraRouter.configure({ dataCache: { staleTime, gcTime, max } })` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Defaults engine (~30s / ~5m) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Per-route / router attr `stale-time` / `gc-time` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

Цель: наследуемые attr (как scroll/prefetch) + override на leaf. Имеет смысл только с `cache="data"`.

---

## 6. `router.invalidate()` — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

| Что | Статус |
|-----|--------|
| `router.invalidate(options?)` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Событие `data-invalidated` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Path prefix / policy `stale` \| `remove` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `router.invalidateView()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> отдельный API |
| Unified invalidate data+view одним вызовом | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Demo: mutate → invalidate | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> DX |

```ts
await api.createUser(data);
router.invalidate({ path: '/users', policy: 'remove' });
router.navigate('/users');
```

> Для гарантированного refetch на следующем load предпочтителен `policy: 'remove'` (default `stale` + текущий `get()` path).

Тесты: `aura-router/test/invalidate.test.ts`.

---

## 7. UI не реагирует на фоновое обновление — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

Даже когда кэш/фоновый fetch обновит память — **committed outlet не перерисовывается**.

Нужно для полноценного SWR, для будущего **defer**, частично после invalidate + silent refetch.

Варианты: re-render outlet · событие `data:revalidated` · внешний reactive store.

```text
п. 1  = КОГДА грузить
п. 7  = ЧТО с UI, когда данные уже другие   ← ✗
```

---

## 8. `cause` в контексте хука — <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span>

Engine различает `phaseMode: 'navigation' | 'prefetch'`, но в `RouteLifecycleContext` хука **нет** явного `cause`.

Цель: `cause: 'enter' | 'prefetch' | 'revalidate'` — разное поведение (лёгкий prefetch vs полный enter + redirect).

---

## 9. View/HTML кэш без «устаревания» — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

| Кэш | Статус |
|-----|--------|
| DataGraph long cache (opt-in) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| ViewGraph / ViewPayloadCache + handoff | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> v1 |
| View SWR default (stale + quiet refetch) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Opt-in `configure({ viewCache: { staleTime } })` | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> |

Подробнее: [CONTENT_CACHE.md](./CONTENT_CACHE.md).

---

## 10. События загрузки / кэша — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

| Событие | Статус |
|---------|--------|
| `data-invalidated` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| Navigation error events | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (др. контур) |
| load start / end / cache hit\|miss\|stale | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| Devtools panel | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

См. [EVENT_BUS.md](./EVENT_BUS.md) · [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md).

---

## 11. Мелочи

### 11a. Ключ кэша по URL/хукам — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> by design

`dataKey` / `viewKey` в `resource-keys.ts` (pattern + params + query). Стабильный «id узла дерева» — не нужен, пока нет A/B на один path.

### 11b. Фаза `load` в phase-registry — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> by design

`load` в реестре есть; production path — только DataGraph через `runLoads` / ResourceGraph, не generic lifecycle runner. Путаница при чтении registry — документом, не баг.

### 11c. Данные родителя в `load` — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

`await ctx.parent()` — opt-in join (nearest ancestor / LCA / handoff). Default parallel — by design.

→ [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md)

### 11d. Быстрый путь без load — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> by design

Tier-0 / `canUseFastPath` → `runFastPipeline` без `runLoads`. Появился `load` — fast path сам отключается.

---

## 12. Parent→child load — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

Принятая модель: **parallel default + opt-in `ctx.parent()`** (SvelteKit-style).  
Engine-forced «child всегда ждёт parent» — <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span>.

→ [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md)

---

## Сводка: приоритеты остатка

| # | Тема | Статус | Срочность | Nested + data? |
|---|------|--------|-----------|----------------|
| 1 | defer / per-route load policy | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | высокий | частично |
| 2 | `reenter-load` policy | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | высокий | да |
| 3 | `shouldRevalidate` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | высокий | да |
| 4 | `cache="data"` default-on | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | средний (DX) | удобство |
| 5 | Per-route TTL | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | средний | нет |
| 6 | `router.invalidate()` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — | закрыто |
| 7 | UI на stale/фоновый refresh | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | высокий | да |
| 8 | `cause` в ctx | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | средний | нет |
| 9 | View SWR default | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | средний | другой слой |
| 10 | Load/cache events | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | средний | нет |
| 11c / 12 | `parent()` / load join | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — | закрыто |

---

## Когда можно сказать «data graph готов»

- [x] Nested: parent из cache/handoff, child грузится, snapshot в render — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>
- [x] После мутации — `router.invalidate()`, следующий переход актуален — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> (API; demo DX ~)
- [x] Child может явно ждать parent через `ctx.parent()` — <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span>
- [ ] Устаревшие данные не блокируют показ **и** экран обновляется при свежих — нужен п. 7 (+ честный stale path)
- [ ] Per-route TTL + `shouldRevalidate` на переход
- [ ] Same-URL / Back — формальная политика `reenter-load`
- [ ] Опционально: defer вторичных loads после commit
- [ ] Devtools / hit·miss·stale events

---

## Связанные документы

| Документ | О чём |
|----------|-------|
| [DATAGRAPH.md](../done/DATAGRAPH.md) | As-is v1 |
| [RESOURCE_GRAPH_HANDOFF.md](../done/RESOURCE_GRAPH_HANDOFF.md) | Prepare owner + handoff |
| [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | Parity vs TanStack / RR7 |
| [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md) | parallel + opt-in `parent()` |
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | View track |
| [FUTURE_PROOF_ENGINE.md](../FUTURE_PROOF_ENGINE.md) | Data graph в картине engine |

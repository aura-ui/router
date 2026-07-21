# Bundle size: аудит и split plan (core 15–20 kB)

> **Статус:** план (2026-07-20) · код фаз 0–4 ещё не внедрён  
> **Продуктовое решение:** <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">принято</span> **slim by default**, advanced — opt-in ([§5.4](#54-принятое-решение-slim-by-default--advanced-opt-in))  
> **Вердикт:** full monolith сейчас **~31 kB gzip**; цель **15–20 kB** — для **default entry** (slim), не для «всё в одном import»  
> **ЦА:** WC / HTML views, скорость загрузки + навигации — [§5](#5-ца-html--wc-views-без-data-load)  
> **Связь:** [PRE_RELEASE_0.0.1.md](./PRE_RELEASE_0.0.1.md) · [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md) · [CONTENT_CACHE.md](./CONTENT_CACHE.md) · [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md)

Легенда: <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ частично</span> · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗ нет</span>

---

## TL;DR

| Метрика | Значение |
|---------|----------|
| `dist/` JS summary (unminified, per-file gzip) | ~298 kB raw · **~113 kB gzip** · 122 files |
| `dist/` TOTAL (+ maps + dts) | ~1.28 MB — **не клиентский payload** |
| App bundle (`AuraRouter.install`, Vite + esbuild minify) | ~108 kB raw · **~31.3 kB gzip** · ~27.8 kB brotli |
| Full public entry vs router-only | delta **~0.1 kB gzip** — tree-shaking не спасает |

**Цель 15–20 kB gzip на default entry:** **slim by default** + advanced opt-in (`/prefetch`, `/data`, `/cache`, …) или `preset: 'full'`. Одними микрооптимизациями текущего monolith — потолок ~24–27 kB.

Повторить замеры:

```bash
npm run build
node scripts/measure-app-bundle.mjs
node scripts/analyze-app-bundle.mjs
```

---

## 1. Что измеряли

### 1.1. Summary по `dist/` (misleading для SPA)

Сборка: `preserveModules` + `minify: false` + sourcemaps (`vite.lib.config.ts`).  
`scripts/build-lib.mjs` суммирует gzip **по каждому файлу отдельно** → завышает относительно одного app-чанка.

| Категория | Размер |
|-----------|--------|
| JS | ~298 kB raw · ~113 kB gzip (122 files) |
| maps | ~720 kB |
| dts | ~264 kB |
| TOTAL | ~1283 kB |

Maps/dts в runtime не едут. Для сравнения с конкурентами смотреть **min+gzip app bundle**.

### 1.2. App bundle (честная метрика)

Скрипт: `scripts/measure-app-bundle.mjs`  
Alias `@auraui/router` → `dist/index.js`, Vite, esbuild minify, один чанк.

| Сценарий | raw | gzip | brotli |
|----------|----:|-----:|------:|
| Full entry (`AuraRouter` + `Route` + `Outlet` + `defineRouteHook`) | 108.0 kB | **31.4 kB** | 27.8 kB |
| Только `AuraRouter.install/configure` | 107.8 kB | **31.3 kB** | 27.8 kB |

`AuraRoute` / `AuraOutlet` почти ничего не добавляют: граф уже тянется через `install()`.

### 1.3. Attribution (minified via sourcemap)

Скрипт: `scripts/analyze-app-bundle.mjs`  
База: ~107.8 kB min · **31.3 kB gzip**.

| Модуль | ~min | ~gzip | Доля |
|--------|-----:|------:|-----:|
| `aura-routing-engine` | 65.8 kB | **19.1 kB** | 61% |
| `aura-route` | 17.5 kB | 5.1 kB | 16% |
| `aura-utils` | 8.4 kB | 2.4 kB | 8% |
| `aura-router` | 7.0 kB | 2.0 kB | 7% |
| `aura-cache-store` | 6.2 kB | 1.8 kB | 6% |
| `aura-outlet` + `aura-dom` | ~2.6 kB | ~0.8 kB | ~2% |

Топ файлов (min): `aura-route.js`, `aura-cache-store.js`, `aura-routing-engine.js`, `navigation-transaction-pipeline.js`, `data-graph.js`, `prefetch/pipeline.js`, `view-graph.js`, `redirect-resolver.js`, …

---

## 2. Сравнение с другими SPA-роутерами

| Пакет | Ориентир min+gzip (app / Bundlephobia) | npm unpacked |
|-------|----------------------------------------|--------------|
| wouter | ~2–3 kB | ~75 kB |
| vue-router | ~12–25 kB | ~1.2 MB |
| **Aura (app bundle)** | **~31 kB** | ~1.25 MB `dist/` |
| @tanstack/react-router | ~40 kB (пакет; app often ~50–90) | ~1.1 MB |
| react-router | ~60 kB | ~2.7 MB |
| TanStack minimal app (их CI) | ~87 kB весь клиент | — |

Aura сейчас **между Vue Router и TanStack/RR** по клиентскому payload — нормально для full-engine, тяжело для «тонкого» SPA-роутера.

---

## 3. Почему monolith

1. **Один `exports["."]`** — нет `/core`, `/prefetch`, …
2. **`AuraRouter.install()`** регистрирует Router + Route + Outlet.
3. **Engine ctor** всегда создаёт `ResourceGraph` (ViewGraph + DataGraph + handoff) и зовёт `initPrefetch()` (prefetch default ON).
4. **`defaultLoaderRegistry`** сразу инстанцирует 6 loaders (Template, Html, Url, Component, Import, Iframe).
5. **Цикл** `AuraRoute` → `AuraRouter` мешает разрезать surface.
6. Tree-shaking: full − router-only ≈ **0**.

Ключевые файлы:

- `src/index.ts`
- `src/modules/aura-router/core/aura-router.ts` / `aura-router-setup.ts`
- `src/modules/aura-routing-engine/core/aura-routing-engine.ts`
- `src/modules/aura-routing-engine/core/view-graph/registry.ts`
- `src/modules/aura-routing-engine/core/resource-graph/resource-graph.ts`

---

## 4. Целевая модель пакета

```
consumer import
      │
      ├─ @auraui/router            → slim DEFAULT (~15–20 kB)  ★ WC-first
      ├─ @auraui/router/full      → всё сразу (~28–32 kB)     DX / migration
      │
      └─ opt-in (поверх slim):
            ├─ /prefetch
            ├─ /loaders/network   (url | import | iframe | component)
            ├─ /data              (DataGraph + hooks runtime)
            └─ /cache             (AuraCacheStore SWR/GC)
```

Алиас: `@auraui/router/core` → тот же граф, что `.` (slim), если нужен явный путь в доках.

Внутри engine — **порты + lazy factory**, не второй класс `AuraRouter`.  
Pipeline уже делегирует в `tx.engine.resourceGraph.load` — удобная граница для `PreparePort`.

| Entry | Экспорт | Тянет |
|-------|---------|--------|
| `.` (default) | `AuraRouter`, `AuraRoute`, `AuraOutlet` | ViewOnly prepare + Template/Html, prefetch off |
| `/full` | то же + auto-enable advanced | текущий full-граф (data + prefetch + cache + network loaders) |
| `/prefetch` | `enablePrefetch` | PrefetchPipeline (поведение default on после import) |
| `/data` | `enableDataGraph` / `defineRouteHook` | DataGraph + hooks |
| `/cache` | `enableAuraCache` | AuraCacheStore |
| `/loaders/network` | `registerNetworkLoaders` | Url/Import/Iframe/Component |

---

## 5. ЦА: HTML / WC views без data load

Позиционирование **«прежде всего view HTML или Web Components, без data load»** задаёт, что должно быть в `/core` по умолчанию, а что — только во full / opt-in.

Достаточный сценарий core: **URL → сменить разметку в outlet** (`template` / html / WC в DOM).

### 5.1. Обязательно (core)

| Слой | Зачем |
|------|--------|
| Match + route-tree (LCA / enter-exit) | nested HTML/WC |
| History + link click | SPA |
| Coordinator + pipeline (хотя бы full/fast) | корректный commit / cancel |
| ViewGraph + **Template / Html** loaders | `view="template::…"` / html |
| `AuraRoute` + `AuraOutlet` (+ простой mount/replace) | WC surface |
| Базовый failure / not-found | без этого нельзя в prod |

Navigation + view mount **не резать** — must-have для этой ЦА.

### 5.2. Не обязательны по умолчанию

| Слой | Почему optional |
|------|-----------------|
| **DataGraph / `load` hooks / SWR data** | нет data load — главный кандидат вынести из `/core` |
| **Hook registry + semver `defineRouteHook`** | без remote hooks почти не нужен |
| **Prefetch pipeline** | полезен как USP, но не обязателен для «просто views»; во **full** можно оставить default on, в `/core` — off / opt-in |
| **Url / Import / Iframe / Component loaders** | нужны не всем; core = Template + Html |
| **AuraCacheStore (полный SWR/GC)** | для views хватает простого Map/TTL; SWR — `/cache` |
| **`cache.dom` / preserve / handoff registry** | keep-alive и prefetch→nav bridge — advanced |
| **ResourceGraph как толстый prepare** | в core — ViewOnly prepare без data + handoff |
| **`transition-order` `parallel` / `in-out`** | хватит instant + опционально `out-in` |
| **Богатый NavigationPulse / EventBus stream** | minimal events в core |
| **Scroll restoration, active-link extras, breadcrumbs** | UX-addons |
| **Redirect walk** | только если есть declarative redirects |

### 5.3. Продуктовое чтение

```
/core  = match → navigate → template/html → outlet
/full  = + data + prefetch + SWR cache + network loaders + handoff
```

Приоритет выноса из default graph для этой ЦА:

1. **Data-слой** (DataGraph, hooks, data SWR)
2. **Prefetch + advanced cache/handoff + лишние loaders**
3. Мелочи observability / transition modes / DX CE

**Prefetch:** во **slim** — нет в графе; после `import '…/prefetch'` или в `/full` — поведение default on (`intent`). Default-on *поведение* ≠ обязательный sync-чанк до первого жеста — lazy-чанк допустим позже без смены UX.

### 5.4. Принятое решение: slim by default + advanced opt-in

> **Статус:** <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">принято</span> (2026-07-20) · реализация — backlog фаз 1–3, **не блокер 0.0.1**, если ship идёт с текущим monolith + пометкой experimental

Позиционирование **WC-first**: роутер должен «летать» и по навигации, и по **загрузке/parse**. Значит default entry = урезанный движок (§5.1); advanced — только по явному подключению.

#### Зачем

| Аргумент | Следствие |
|----------|-----------|
| ЦА — HTML/WC views без data | DataGraph/hooks не в default |
| Первый `npm i` + `<aura-router>` | ~15–20 kB gzip, не ~31+ |
| Скорость навигации ≠ размер неиспользуемых слоёв | Prefetch/SWR не помогают, пока не включены, но **всегда** стоят в parse |
| Контраст с Lit Router (~1 kB) | Не догнать wouter/Lit по весу, но default не должен быть «тяжёлый full-engine втихую» |

#### Как оформлять API

| Способ | Когда | Заметка |
|--------|-------|---------|
| **Default `.` = slim** | основной путь | Реально маленький бандл |
| **`import '@auraui/router/prefetch'`** (и `/data`, `/cache`, …) | точечный advanced | Bundler видит зависимость; tree-shake честный |
| **`@auraui/router/full`** или `install({ preset: 'full' })` | «всё сразу» / demo / migration | Одна строка DX без сборки opt-in вручную |
| **`configure({ prefetch: 'intent' })`** | включает *поведение* | Код подтягивает side-entry или documented `import()`; не сканировать DOM на `install` |

Пример целевого DX:

```ts
// default — slim (быстрая загрузка)
import { AuraRouter } from '@auraui/router';
AuraRouter.install();

// advanced — явно
import { AuraRouter } from '@auraui/router';
import '@auraui/router/prefetch';
import '@auraui/router/data';
AuraRouter.configure({ prefetch: 'intent' });
AuraRouter.install();

// или всё сразу
import { AuraRouter } from '@auraui/router/full';
AuraRouter.install();
```

#### Риски и закрытие

| Риск | Митигация |
|------|-----------|
| «Фича не работает, пока не импортнул» | README: таблица default vs opt-in + copy-paste full starter |
| Breaking для early adopters | Пока **0.0.1 / не в registry** — окно сделать slim = default сразу; иначе 0.1 + `preset: 'full'` как переход |
| DX «должно просто работать» | `/full` и demo на full-preset |
| Prefetch как USP «пропал» | Не выкидывать из продукта: в `/full` и `/prefetch` default on; в slim — нет |
| Автодетект модулей на `install()` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗ отвергнуто</span> — хрупко, async race, водопад; только явный import / preset |

#### Окно релиза

| Вариант | Когда выбирать |
|---------|----------------|
| **A. Slim = default с 0.0.1** | Ещё нет внешних потребителей — честнее для WC-позиционирования |
| **B. 0.0.1 = текущий full monolith**, slim default с 0.1 | Безопаснее, если уже есть тихие тестеры; в 0.0.1 — LIMITATIONS + «bundle ~31 kB, slim roadmap» |

Рекомендация документа: **A**, если publish 0.0.1 = первый публичный API; иначе **B** с явной датой переключения default.

---

## 6. Фазы внедрения

### Фаза 0 — измеримость <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ скрипты есть</span>

- [x] `scripts/measure-app-bundle.mjs`
- [x] `scripts/analyze-app-bundle.mjs`
- [ ] Сценарии `core-entry` / `full-entry` / `core+prefetch` в measure
- [ ] Заготовка `exports` в `package.json` (пока на те же файлы)
- [ ] Budget gate в CI (после появления `/core`)

**Done:** стабильные цифры до/после каждой фазы.

---

### Фаза 1 — дешёвые отрезы (~−3–5 kB) <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

Низкий риск. Ожидание full-default: **~26–28 kB**.

#### Граница A — Prefetch

Файл: `aura-routing-engine.ts`

- [ ] В **slim (default `.`)**: prefetch отсутствует в графе
- [ ] В **`/full`** и после `import '…/prefetch'`: поведение default on (`intent`) — §5.3–5.4
- [ ] Убрать static import `./prefetch/*` из slim engine path
- [ ] Опционально позже: dynamic `import('./prefetch/bootstrap.js')` без смены UX full
- [ ] Side-entry: `src/prefetch.ts` → `enablePrefetch(router)`

#### Граница B — Loaders

Файл: `view-graph/registry.ts`

- [ ] Core registry: только `TemplateLoader` + `HtmlLoader`
- [ ] Network loaders — lazy на первый `get("url"|"import"|…)` **или** `registerNetworkLoaders(registry)` из `/loaders/network`

#### Граница C — sideEffects

- [ ] Уточнить `package.json` `sideEffects` (CE register vs tree-shake loaders)

Порядок файлов фазы 1:

1. `view-graph/registry.ts`
2. `aura-routing-engine-config.ts`
3. `aura-routing-engine.ts`
4. `prefetch/bootstrap.ts` (новый)

---

### Фаза 2 — ResourceGraph как порт (~−4–7 kB) <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

Средний риск. Ожидание core-entry: **~22–25 kB**.

#### Граница D — PreparePort

```ts
interface PreparePort {
  load(enter, ctx): Promise<ResolveResult>;
  invalidateData?(…): number;
  invalidateView?(…): number;
}
```

| Реализация | Где | Содержимое |
|------------|-----|------------|
| `ViewOnlyPrepare` | core | ViewGraph + Template/Html, без DataGraph |
| `FullResourceGraph` | `/data` или full | текущий ResourceGraph |

- [ ] Engine держит `prepare: PreparePort` (alias `resourceGraph` ок для compat)
- [ ] Pipeline не переписывать — только смена реализации за портом

#### Граница E — cache

- [ ] Core: простой `Map` / TTL для view payloads
- [ ] `AuraCacheStore` только через `/cache` или `configure({ viewCache: … })`

---

### Фаза 3 — package surface <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

Ожидание: **`.` slim 17–20 kB**, `/full` **~28–32 kB** (см. §5.4).

```json
"exports": {
  ".": "./dist/index.js",
  "./core": "./dist/index.js",
  "./full": "./dist/full.js",
  "./prefetch": "./dist/prefetch.js",
  "./data": "./dist/data.js",
  "./cache": "./dist/cache.js",
  "./loaders/network": "./dist/loaders/network.js"
}
```

- [ ] `src/index.ts` = slim; `src/full.ts` = slim + side-effect enable advanced
- [ ] `install({ preset: 'full' })` или эквивалент для DX
- [ ] README: таблица default vs opt-in + full starter
- [ ] Разорвать цикл AuraRoute → AuraRouter через тонкий `RouterHost` port (архитектурный unlock, мало kB сразу)
- [ ] Тесты: suite на `/full` (текущее поведение); smoke на slim default

---

### Фаза 4 — только если core > 20 kB после фазы 3 <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

Высокий риск / низкий ROI — не начинать раньше замера.

- [ ] Slim pipeline (вынести transition/prefetch branches)
- [ ] Route lite CE (без transition/preserve attr parsers), если `aura-route` > ~4 kB gz в core
- [ ] Lazy redirect resolver, если нет `redirect` в дереве

---

## 7. Budget gate (после фазы 3)

| Entry | gzip budget | Fail if |
|-------|------------:|---------|
| `.` slim (default) | ≤ 20.0 kB | > 20.5 kB |
| `/full` | ≤ 34.0 kB | регрессия +5% vs baseline |
| slim + `/prefetch` | ≤ 23.0 kB | — |

Траектория:

```
31 kB (monolith) ──F1──► ~26–28 ──F2──► ~22–25 ──F3──► default slim 17–20 / full ~30
```

---

## 8. Чего не делать в первом проходе

- Не дробить navigation pipeline «на всякий случай»
- Не выносить matcher / route-tree из core
- Не плодить второй класс `AuraRouter`
- Не резать nested routes ради kB
- Не гнаться за 15–20 kB на full feature set в одном import

---

## 9. Честный вердикт

| Цель | Реалистично? |
|------|:------------:|
| Full feature set ≤ 20 kB gzip | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| **Default slim 15–20 kB** + `/full` ~28–32 kB | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> |
| Один пакет, всё включено, ~25 kB (lazy) | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> |
| Один import = всё advanced ≤ 20 kB | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

**Продуктово:** slim by default (§5.4) — принято под WC-first.  
**Следующий шаг:** не блочить 0.0.1 ради полного split; зафиксировать в README/LIMITATIONS направление; backlog — фазы 1–3. Первый PR по размеру: ViewOnly/data split + network loaders out of slim; `/full` сохраняет нынешнее поведение.

# TODO: политика prefetch modes (hover / tap / viewport)

> **Статус:** <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ В ПРОЦЕССЕ</span> — v1 ✓ · pointerdown / viewport / queue ✗  
> **Сверка с кодом:** 2026-07-19  
> **Связь:** [PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md) · [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md) · [../done/LINK_DRIVEN_PRELOAD.md](../done/LINK_DRIVEN_PRELOAD.md) · [prefetch-policy.ts](../../src/modules/aura-routing-engine/core/prefetch/prefetch-policy.ts) · [policy.ts](../../src/modules/aura-routing-engine/core/prefetch/policy.ts)

### Легенда

| Метка | Значение |
|-------|----------|
| <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> | в production path / покрыто тестами |
| <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span> | каркас / mode есть, не до конца |
| <span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✗ ОСТАЛОСЬ</span> | не сделано |
| <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ НЕ ДЕЛАТЬ</span> | сознательно вне scope |

### Сводка прогресса

| Блок | Статус | Что дальше |
|------|--------|------------|
| Один mode в attr (не `intent,tap`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Cascade link → route → router | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Confidence tiers (`intent` / `tap` / `manual`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Tap-gate: view не на hover | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Link events (hover / focus / touch) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Dedupe / cancel / `same-route-fresh` | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | — |
| Parallel view ‖ data на один run | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | через ResourceGraph |
| `pointerdown` → `tap` (desktop) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | эскалация без touch |
| `ViewportIntentSource` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | mode в типах есть |
| Prefetch queue / приоритеты | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | фаза 2 |
| E2E hover→pointerdown→click | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | unit ✓ · e2e pointerdown ✗ |
| Devtools: mode + confidence | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | `onIntent` hook есть |

---

## Вопрос

Нужно ли на одной ссылке включать **несколько режимов сразу**, например `prefetch="intent,tap"` (hover **и** tap)?

**Короткий ответ:** в индустрии **нет** — один режим в конфиге.  
**Да** встречается: разные **события** → разная агрессивность и **эскалация** (hover легче → tap/pointer тяжелее).

<span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ РЕШЕНИЕ ПРИНЯТО</span> — один mode в attr; эскалация через события + confidence, не через CSV.

---

## Как у мировых роутеров

| Router | Конфиг на ссылке | Несколько modes в одном attr |
|--------|------------------|------------------------------|
| TanStack Router | один `preload`: `false` \| `intent` \| `viewport` \| `render` | ✗ |
| React Router 7 | один `prefetch`: `none` \| `intent` \| `render` | ✗ |
| Next.js App Router | `prefetch={true\|false}` | ✗ |
| SvelteKit | один `data-sveltekit-preload-data`: `hover` \| `tap` \| `off` | ✗ |
| **Aura** | каскад `data-prefetch` → route `prefetch` → router `prefetch` | ✗ |

SvelteKit: `hover` **или** `tap` — не оба. На touch срабатывает tap-поведение, на desktop — hover.

---

## Три паттерна (вместо «intent + tap в attr»)

### 1. Эскалация по событию (confidence tiers) — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (ядро) · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> pointerdown

Один URL, разные фазы намерения:

```text
hover / focus     →  дешёвый prefetch (часто только data / loaders)     ✓
tap / pointerdown →  агрессивный (data + document / html-src)          tap ✓ · pointerdown ✗
click             →  cache hit, минимум сети                             ✓ handoff
```

**Aura v1** (через `PrefetchPolicy.confidenceFor`, не через два attr):

| Mode | Событие | Confidence | Data (`load`) | View (`html-src` / view) | Статус |
|------|---------|------------|---------------|--------------------------|--------|
| `intent` | mouseover, focusin | 0.3 | ✓ (≥ 0.3) | ✗ (< 0.8) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `tap` | touchstart | 0.85 | ✓ | ✓ | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `viewport` | (source TODO) | 0.5 | ✓ | ✗ | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> mode/policy ✓ · IO ✗ |
| `manual` | `router.prefetch()` | 1.0 | ✓ | ✓ | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| *(нет mode)* | **pointerdown** → escalate `tap` | 0.85 | ✓ | ✓ | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

Код: `core/prefetch/policy.ts` — `VIEW_PREFETCH_MIN_CONFIDENCE = 0.8`, `DATA_PREFETCH_MIN_CONFIDENCE = 0.3`.

Tap-gate для view на hover — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (`shouldPrefetchView` + `DefaultPrefetchResourcePlanner`). Контекст: [PREFETCH_NEXT_GEN.md §Foundation](./PREFETCH_NEXT_GEN.md).

### 2. Параллельные resource kinds на один intent — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

На **один** prefetch run (один mode) грузят **параллельно** (по plan):

- data (load hooks / JSON)
- view (HTML partial, route module)

Не «два режима», а два kind в `planResources` → один `ResourceGraph.load` (раньше: silo executors).

### 3. Dedupe вместо повторного fetch — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

Повторный intent на тот же `href`:

- in-flight merge → один run / handoff Promise на ключ
- `staleTimeMs` (~30s) → `same-route-fresh` skip
- `mouseout` / новый intent → `cancelIntent` + `AbortSignal`

Сценарий hover → tap на одном URL: второй run **дополняет** (view), **склеивается** с inflight / handoff или **skip** если fresh.

---

## Aura: события → mode — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ЧАСТИЧНО</span>

Реализация: `link-prefetch-intent.ts` → `resolvePrefetchMode()` → `PrefetchPipeline`.

| DOM-событие | `touch` | Resolved mode (типично) | Delay | Статус |
|-------------|---------|-------------------------|-------|--------|
| `mouseover`, `focusin` | false | `intent` (или cascade) | 50ms (`intentDelayMs`) | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `touchstart` | true | `tap` (или cascade) | 0 | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `mouseout`, `focusout` | — | cancel для href | — | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> |
| `pointerdown` / `mousedown` | — | escalate → `tap` | 0 | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |
| viewport enter (IO) | — | `viewport` | `viewportDelayMs` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> |

**Desktop:** в основном hover → `intent`.  
**Mobile:** `touchstart` → `tap`; hover часто нет.

`data-prefetch="tap"` на ссылке — явная tap-политика в каскаде; на desktop без touch почти не сработает, пока нет `pointerdown` (tap слушает только `touchstart`).

### Каскад конфигурации (когда греть) — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

Отдельно от mode tiers — **кто задаёт default mode**:

```text
data-prefetch (link)  →  prefetch (route)  →  prefetch (router)
```

См. `prefetch-policy.ts` → `resolvePrefetchMode()`. Тесты: `prefetch-policy.test.ts`, `prefetch-cascade.test.ts`.

---

## Чего нет (и не нужно в attr) — <span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">⊘ НЕ ДЕЛАТЬ</span>

```html
<!-- ✗ не industry pattern -->
<a data-prefetch="intent,tap">

<!-- ✓ default -->
<a href="/b" data-router-link>

<!-- ✓ исключения -->
<a href="/admin" data-router-link data-prefetch="false">
<a href="/heavy" data-router-link data-prefetch="tap">
```

```html
<aura-router prefetch="intent">
  <aura-route path="/quiet" prefetch="false"></aura-route>
</aura-router>
```

---

## Roadmap

| # | Задача | Статус | Зачем |
|---|--------|--------|-------|
| 1 | **`pointerdown`** / `mousedown` → mode `tap` на desktop | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | эскалация без touch |
| 2 | Tap-gate: view **не** на hover, только tap/manual | <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> | bytes + SSR moat — [PREFETCH_NEXT_GEN](./PREFETCH_NEXT_GEN.md) |
| 3 | `ViewportIntentSource` (`IntersectionObserver`) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | mode `viewport` в типах есть, source нет |
| 4 | Prefetch **queue** + приоритет (viewport < hover < tap) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | как Next.js link queue — [LINK_DRIVEN](../done/LINK_DRIVEN_PRELOAD.md) |
| 5 | E2E: hover data only → pointerdown content → click 0 dup | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | unit: intent skips view ✓ · handoff ✓ · pointerdown e2e ✗ |
| 6 | Документировать `onIntent` / devtools: mode + confidence | <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> | `onIntent` / `onSkipped` hooks ✓ · panel ✗ |

**Не делать:** <span style="background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">⊘</span> `data-prefetch="intent,tap"` — путаница; вместо этого router `intent` + event escalation.

---

## Критерии готовности (mode policy v2)

### v1 (закрыто)

- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Hover на view route не качает partial (только data при `load`)
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Tap / `manual` качает view; click после prefetch = handoff hit
- [x] <span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✓</span> Тесты: intent skips view, tap includes view, cascade, cancel

### v2 (осталось)

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Desktop: `pointerdown` эскалирует до tap без touch
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Viewport links prefetch без hover
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Queue: viewport < hover < tap
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 6px;border-radius:4px;font-weight:700">~</span> E2E hover → pointerdown → click 0 dup network
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Devtools / docs: mode + confidence per run

---

## Связанные документы

| Документ | Тема |
|----------|------|
| [PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md) | Pipeline, DOM → bus |
| [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md) | Confidence tiers, ISNR (Foundation ✓) |
| [../done/LINK_DRIVEN_PRELOAD.md](../done/LINK_DRIVEN_PRELOAD.md) | Принятая link-driven стратегия |
| [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | Data layer после prefetch |
| [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) | Оценка vs TanStack / SvelteKit |

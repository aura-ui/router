# TODO: политика prefetch modes (hover / tap / viewport)

> **Сверка с кодом:** 2026-06-30  
> **Статус:** v1 в коде (intent + tap + confidence tiers); pointerdown / полный tap-gate — TODO  
> **Связь:** [PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md) · [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md) · [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) · [prefetch-policy.ts](../../src/modules/aura-routing-engine/core/prefetch/prefetch-policy.ts)

---

## Вопрос

Нужно ли на одной ссылке включать **несколько режимов сразу**, например `prefetch="intent,tap"` (hover **и** tap)?

**Короткий ответ:** в индустрии **нет** — один режим в конфиге.  
**Да** встречается: разные **события** → разная агрессивность и **эскалация** (hover легче → tap/pointer тяжелее).

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

### 1. Эскалация по событию (confidence tiers)

Один URL, разные фазы намерения:

```text
hover / focus     →  дешёвый prefetch (часто только data / loaders)
tap / pointerdown →  агрессивный (data + document / html-src)
click             →  cache hit, минимум сети
```

**Aura v1** (через `PrefetchPolicy.confidenceFor`, не через два attr):

| Mode | Событие | Confidence | Data (`load`) | Content (`html-src`) |
|------|---------|------------|---------------|----------------------|
| `intent` | mouseover, focusin | 0.3 | ✓ (≥ 0.3) | ✗ (< 0.8) |
| `tap` | touchstart | 0.85 | ✓ | ✓ |
| `viewport` | (source TODO) | 0.5 | ✓ | ✗ |
| `manual` | `router.prefetch()` | 1.0 | ✓ | ✓ |

Код: `core/prefetch/policy.ts` — `CONTENT_PREFETCH_MIN_CONFIDENCE = 0.8`, `DATA_PREFETCH_MIN_CONFIDENCE = 0.3`.

Полный tap-gate для `html-src` на hover — [PREFETCH_NEXT_GEN.md §Foundation](./PREFETCH_NEXT_GEN.md).

### 2. Параллельные resource kinds на один intent

На **один** prefetch run (один mode) часто грузят **параллельно**:

- data (load hooks / JSON)
- content (HTML partial, route module)

Не «два режима», а два **executor**'а: `DataPrefetchExecutor` + `ContentPrefetchExecutor`.

### 3. Dedupe вместо повторного fetch

Повторный intent на тот же `href`:

- in-flight merge → один `promise` на normalized URL
- `staleTimeMs` (~30s) → `same-route-fresh` skip
- `mouseout` / новый intent → `cancelIntent` + `AbortSignal`

Сценарий hover → tap на одном URL: второй run **дополняет** (content), **склеивается** с inflight или **skip** если cache fresh.

---

## Aura: события → mode

Реализация: `link-prefetch-intent.ts` → `resolvePrefetchMode()` → `PrefetchPipeline`.

| DOM-событие | `touch` | Resolved mode (типично) | Delay |
|-------------|---------|-------------------------|-------|
| `mouseover`, `focusin` | false | `intent` (или cascade) | 50ms (`intentDelayMs`) |
| `touchstart` | true | `tap` (или cascade) | 0 |
| `mouseout`, `focusout` | — | cancel для href | — |

**Desktop:** в основном hover → `intent`.  
**Mobile:** `touchstart` → `tap`; hover часто нет.

`data-prefetch="tap"` на ссылке — явная tap-политика в каскаде; на desktop без touch почти не сработает (tap слушает только `touchstart`).

### Каскад конфигурации (когда греть)

Отдельно от mode tiers — **кто задаёт default mode**:

```text
data-prefetch (link)  →  prefetch (route)  →  prefetch (router)
```

См. `prefetch-policy.ts` → `resolvePrefetchMode()`.

---

## Чего нет (и не нужно в attr)

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

| # | Задача | Зачем |
|---|--------|-------|
| 1 | **`pointerdown`** / `mousedown` → mode `tap` на desktop | эскалация без touch |
| 2 | Tap-gate: `html-src` **не** на hover, только tap/manual | bytes + SSR moat — [PREFETCH_NEXT_GEN](./PREFETCH_NEXT_GEN.md) |
| 3 | `ViewportIntentSource` (`IntersectionObserver`) | mode `viewport` в типах есть, source нет |
| 4 | Prefetch **queue** + приоритет (viewport < hover < tap) | как Next.js link queue — [LINK_DRIVEN_PRELOAD](./LINK_DRIVEN_PRELOAD.md) |
| 5 | E2E: hover data only → pointerdown content → click 0 dup network | confidence tiers end-to-end |
| 6 | Документировать `onIntent` / devtools: mode + confidence per run | DX |

**Не делать:** `data-prefetch="intent,tap"` — путаница; вместо этого router `intent` + event escalation.

---

## Критерии готовности (mode policy v2)

- [ ] Desktop: `pointerdown` эскалирует до tap без touch
- [ ] Hover на `html-src` route не качает partial (только data)
- [ ] Tap/pointerdown качает partial; click = cache hit
- [ ] Viewport links prefetch без hover
- [ ] Тесты: intent skips content, tap includes content, dedupe hover→tap

---

## Связанные документы

| Документ | Тема |
|----------|------|
| [PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md) | Pipeline, DOM → bus |
| [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md) | Confidence tiers, ISNR |
| [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) | Принятая link-driven стратегия |
| [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | Data layer после prefetch |
| [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) | Оценка vs TanStack / SvelteKit |

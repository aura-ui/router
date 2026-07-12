# SSR — отдельный server navigation path

> **Статус:** ⚠️ **под вопросом** — идея зафиксирована, решение не принято; нужно обсудить scope, API и связь с client pipeline.  
> **Roadmap:** **не обещаем** (см. [SSR_MPA_STRATEGY.md](./SSR_MPA_STRATEGY.md) — публичный Phase 8 = MPA→SPA без server runtime).  
> **Сверка с кодом:** 2026-07-13 — client-only; `followRedirectsWithGuardWalk` + full pipeline.

---

## Зачем отдельный документ

[SSR_MPA_STRATEGY.md](./SSR_MPA_STRATEGY.md) описывает **MPA→SPA** vs **SSR runtime** в целом.  
Здесь — узкий вопрос: **нужен ли второй navigation path на сервере**, отличный от browser `NavigationCoordinator.navigate`, и как в нём жить **redirect** (особенно из `load`).

---

## As-is (client)

```text
navigateTo
  → followRedirectsWithGuardWalk     ← declarative redirect + guard walk (enter guard only)
  → coordinator.run
       → leave → guard → load → render → history
```

| Redirect | Поведение на client |
|----------|---------------------|
| declarative `redirect` attr | collapse в resolve |
| `guard` | collapse в guard walk или full pipeline |
| `load` | **после `leave`** → `applyRedirect` → **новый** `navigateTo` |

См. [HOOKS.md § Redirect: guard vs load](../HOOKS.md), [redirect/README.md](../../src/modules/aura-routing-engine/core/redirect/README.md).

---

## Гипотеза: server path

Отдельная entry point для HTTP-запроса (не popstate / click):

```text
GET /users/42
  → match (тот же matcher + registry)
  → resolve redirects (declarative + server guard?)
  → blocking pre-render (guard + load — без leave?)
  → redirect? → HTTP 302/301
  → иначе render HTML (+ optional __AURA_SSR__ payload)
```

| Аспект | Client path | Server path (гипотеза) |
|--------|-------------|-------------------------|
| History | `pushState` / provider | HTTP redirect response |
| `leave` | да | обычно **нет** (нет «текущей SPA-страницы» в том же смысле) |
| Render | DOM patch | HTML string |
| `load` redirect | новый `navigateTo` | **302** или re-resolve в том же request |
| Guard redirect | guard walk collapse | **302 до body** |
| Supersede | coordinator generation | один request — один проход |

---

## Открытые вопросы (⚠️ не решены)

1. **Один pipeline или два модуля?**  
   Переиспользовать `buildTransitionPlan` + phase registry vs отдельный `ServerNavigationResolver`.

2. **Load redirect на server — first-class?**  
   В RR/TanStack loader redirect = HTTP response. На client мы load redirect **не** collapse в walk — на server это может быть **основной** паттерн.

3. **Guard walk на server**  
   Нужен ли аналог `followRedirectsWithGuardWalk`, или достаточно одного прохода guard+load без «walk»?

4. **Cookies / session**  
   Guard на server читает cookie; контракт hook context (`from`, `action`, signal) другой.

5. **Hydration**  
   Server HTML должен совпасть с первым client render; иначе double fetch / flash.

6. **MPA→SPA без SSR**  
   Если сервер отдаёт готовые `.html` — **server path не нужен** ([SSR_MPA_STRATEGY § MPA→SPA](./SSR_MPA_STRATEGY.md)). Эта задача актуальна только для **единого SPA entry** на все URL.

7. **Приоритет vs client polish**  
   Guard 2×, prefetch cache LRU, load-redirect policy на client — делать раньше server path?

---

## Что уже есть в коде (задел)

| Есть | Нет |
|------|-----|
| `AuraRoutingUrlMatcher`, registry — переиспользуемы на Node | `renderAuraRoute()` / server navigate entry |
| `FakeHistoryProvider` | HTTP redirect as navigation outcome |
| `ViewLoaderEnv.isSSR` (зарезервирован) | Server guard → 302 до HTML |
| | Load redirect → Response, не `applyRedirect` |

---

## Связанные документы

| Документ | Связь |
|----------|--------|
| [SSR_MPA_STRATEGY.md](./SSR_MPA_STRATEGY.md) | MPA→SPA (roadmap) vs SSR runtime (исследование) |
| [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) | Client collapse — **не** переносится 1:1 на HTTP |
| [HOOKS.md](../HOOKS.md) | guard vs load redirect (client contract) |
| [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md) | ISNR / post-parity SSR |

---

## Критерий «go / no-go» (черновик)

**Go**, если:

- продуктовая ставка на **один `index.html` + SSR** (не только MPA→SPA);
- нужны **server-side auth redirect** и **load data в первом байте** из одного route tree;
- готовы поддерживать **два** navigation contract (client + server) или чёткий shared core.

**No-go / отложить**, если:

- достаточно MPA→SPA + client Aura;
- server path дублирует nginx/шаблонизатор без выигрыша;
- не ясен hydration и load-redirect semantics.

---

## Чеклист (не начато)

- [ ] ADR: один path vs shared core + adapters
- [ ] Маппинг redirect outcomes → HTTP (302, 404, 500)
- [ ] Минимальный spike: `match + guard → 302` на Node без full render
- [ ] Политика load redirect на server vs client (единый HOOKS contract)
- [ ] Связь с Phase 8 roadmap — не смешивать с MPA→SPA

# TODO / планы реализации

Черновики архитектуры и задач, ещё не внедрённых в код.

| Документ | Описание |
|----------|----------|
| [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) | Схлопывание синхронных цепочек blocking-redirect до одного pipeline run |
| [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) | Nested outlet, ViewHandle, layout/content, patch/анимация; без `aura-route-view` |
| [OUT_IN_PREFETCH.md](./OUT_IN_PREFETCH.md) | Политика `out-in-prefetch`: параллельный hidden render + строгий out-in |
| [DATAGRAPH.md](./DATAGRAPH.md) | DataGraph v1 в коде: `load` hooks, SWR, prefetch; parity → [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) |
| [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) | Пробелы DataGraph v1: defer, revalidate, UI на stale, … |
| [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md) | **TODO:** DAG зависимостей load (parent→child) vs flat `Promise.all` на enter-ветке |
| [NAVIGATION_PERF_AUDIT.md](./NAVIGATION_PERF_AUDIT.md) | **Аудит:** hot path perf — узкие места + ссылка на `bench/` |
| [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | **Что такое зрелый data/SWR слой**, gap vs TanStack/RR7, roadmap |
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | Кэш контента (ContentLoader): prefetch `html-src` / partial; SWR для view — TODO |
| [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) | **Принятая стратегия:** link-driven prefetch + router-owned Data cache |
| [../PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md) | **Реализовано:** текущая архитектура prefetch pipeline |
| [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md) | Hover vs tap: один mode в attr, эскалация по событиям, confidence tiers |
| [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) | Оценка prefetch vs TanStack / Remix / SvelteKit (6.5/10) |
| [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) | Devtools для кеша: события, dev-панель, регистрация в demo (пошагово) |
| [VIEW_LAYER_ARCHITECTURE.md](./VIEW_LAYER_ARCHITECTURE.md) | Поток view-слоя, слабые места, greenfield (`aura-route-2` ~75%) и статус v1/v2 |
| [ATOMIC_BRANCH_COMMIT.md](./ATOMIC_BRANCH_COMMIT.md) | **P0:** branch resolve → sync apply enter-ветки; defer replace, detached snapshot, nested gap |
| [REPLACE_SUPERSEDE_ROLLBACK.md](./REPLACE_SUPERSEDE_ROLLBACK.md) | `revertInFlightView`: stage vs replace, supersede до/после mount, detached snapshot TODO |
| [../comparison/ENGINE_ARCHITECTURE_COMPARISON.md](../comparison/ENGINE_ARCHITECTURE_COMPARISON.md) | Сравнение архитектуры engine vs Vue/RR/Angular/TanStack + roadmap (P0–P3) |
| [../POP_NAVIGATION.md](../POP_NAVIGATION.md) | Pop (Back/Forward): asymmetry, history policy, guard recipes |
| [CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) | Content resolver в `aura-route-2/core/loader` — статус, аудит, ограничения |
| [ROUTE_CONTENT_SNAPSHOT_PATCH.md](./ROUTE_CONTENT_SNAPSHOT_PATCH.md) | Точечное обновление `RouteNode.content` vs полный `refreshRoutes()` |
| [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md) | Prefetch следующего поколения (ISNR); **топ-3 SSR** post-parity |
| [LIFECYCLE_PHASE_NAMING.md](./LIFECYCLE_PHASE_NAMING.md) | Lifecycle attrs (tiers) + **parity с мировыми роутерами** (как думать в будущем) |
| [PARAM_CHANGE_POLICY.md](./PARAM_CHANGE_POLICY.md) | **RFC:** param-change на `:id` — view-key inference (update vs full) + `param-change` override |
| [IN_PLACE_REMOUNT.md](./IN_PLACE_REMOUNT.md) | **TODO:** in-place remount — controller-first, оба cache, упрощение plan (убрать hook/view exit split) |
| [TRANSITION_ANIMATION_TESTS.md](./TRANSITION_ANIMATION_TESTS.md) | **TODO:** тесты CSS/GSAP/Web Animations — gap vs текущие transition integration (phases + DOM-слои) |
| [TRANSITION_PRESENTATION_CORE.md](./TRANSITION_PRESENTATION_CORE.md) | **TODO:** общие CSS + presentation-state для crossfade в core (сейчас reference в demo) |
| [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md) | View Transitions API (`startViewTransition`) — engine-обёртка, фаза 7 |
| [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) | DOM events: что есть (`not-found`, errors) и roadmap (`navigation-commit`, cancel, …) |
| [OPTIMISTIC_URL.md](./OPTIMISTIC_URL.md) | **RFC:** optimistic URL vs stage-until-commit; текущий рассинхрон content/history и TODO |
| [RENDERER_ABSTRACTION.md](./RENDERER_ABSTRACTION.md) | **Фаза 6:** engine-level `Renderer.renderNode()` + централизованный `dispose`; ViewHandle ✓, engine Renderer ✗ |
| [EVENT_BUS.md](./EVENT_BUS.md) | **Фаза 7:** внутренний EventBus (`navigation:*`, `load:*`, `node:*`) — as-is, точки emit, план EB0–EB4 |
| [SSR_MPA_STRATEGY.md](./SSR_MPA_STRATEGY.md) | MPA→SPA (roadmap Phase 8) + SSR runtime как исследование (не в roadmap) |
| [ROUTE_API_V3.md](./ROUTE_API_V3.md) | Путь as-is → [README](../README.md): `view`, loaders, lifecycle `guard\|ready`, `cache` |
| [NESTED_ROUTES_JOY_MODEL.md](./NESTED_ROUTES_JOY_MODEL.md) | Route Folders: nested DX поверх [ROUTE_API_V3](./ROUTE_API_V3.md) — layout+view, inherit, paths, links |
| [PRE_RELEASE_0.0.1.md](./PRE_RELEASE_0.0.1.md) | **Чеклист:** merge в `main` + npm `@aura-ui-web/router@0.0.1` — аудит, блокеры, must-have |
| [ADOPTION_AND_GTM.md](./ADOPTION_AND_GTM.md) | Перспективы, GTM, hero README/landing, outline Vaadin→Aura migration |
| [NAVIGATION_ERROR_V2.md](./NAVIGATION_ERROR_V2.md) | **Реализовано:** обработка ошибок v2 — detection / recovery / reporting (5 фаз) |
| [navigation-error-v2.sketch.ts](./navigation-error-v2.sketch.ts) | Deprecated TS-скетч (историческая справка) |

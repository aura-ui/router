# TODO / планы реализации

Черновики архитектуры и задач, ещё не внедрённых в код.

| Документ | Описание |
|----------|----------|
| [REDIRECT_CHAIN_COLLAPSE.md](./REDIRECT_CHAIN_COLLAPSE.md) | <span style="background:#2ea043;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> guard/leave + declarative collapse (`followRedirectsWithGuardWalk`); resolve с `runLoads` ⊘ |
| [OUTLET_AND_RENDER.md](./OUTLET_AND_RENDER.md) | Nested outlet, ViewHandle, layout/content, patch/анимация; без `aura-route-view` |
| [OUT_IN_PREFETCH.md](./OUT_IN_PREFETCH.md) | Политика `out-in-prefetch`: параллельный hidden render + строгий out-in |
| [DATAGRAPH.md](./DATAGRAPH.md) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ v1</span> load/SWR/prefetch · parity → [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) |
| [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> invalidate + `parent()` ✓ · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> defer · shouldRevalidate · UI-on-stale |
| [DATAGRAPH_LOAD_DAG.md](./DATAGRAPH_LOAD_DAG.md) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> parallel default + opt-in `ctx.parent()` · engine-forced DAG ⊘ |
| [NAVIGATION_PERF_AUDIT.md](./NAVIGATION_PERF_AUDIT.md) | **Аудит:** hot path perf — узкие места + ссылка на `bench/` |
| [DATA_SWR_PARITY.md](./DATA_SWR_PARITY.md) | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> DataGraph SWR ✓ · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> shouldRevalidate · per-route TTL · view SWR |
| [CONTENT_CACHE.md](./CONTENT_CACHE.md) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ v1</span> ViewGraph/ViewPayloadCache · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> unified invalidate · view SWR default |
| [LINK_DRIVEN_PRELOAD.md](./LINK_DRIVEN_PRELOAD.md) | **Принятая стратегия:** link-driven prefetch + router-owned Data cache |
| [../PREFETCH_ARCHITECTURE.md](../PREFETCH_ARCHITECTURE.md) | **Реализовано:** текущая архитектура prefetch pipeline |
| [PREFETCH_MODE_POLICY.md](./PREFETCH_MODE_POLICY.md) | Mode policy: v1 ✓ (tiers + tap-gate) · pointerdown / viewport / queue ✗ |
| [../comparison/PREFETCH_INDUSTRY_COMPARISON.md](../comparison/PREFETCH_INDUSTRY_COMPARISON.md) | Оценка prefetch vs TanStack / Remix / SvelteKit (6.5/10) |
| [CACHE_DEVTOOLS.md](./CACHE_DEVTOOLS.md) | Devtools для кеша: события, dev-панель, регистрация в demo (пошагово) |
| [VIEW_LAYER_ARCHITECTURE.md](./VIEW_LAYER_ARCHITECTURE.md) | Поток view-слоя, слабые места, greenfield (`aura-route-2` ~75%) и статус v1/v2 |
| [ATOMIC_BRANCH_COMMIT.md](./ATOMIC_BRANCH_COMMIT.md) | **P0:** branch resolve → sync apply enter-ветки; defer replace, detached snapshot, nested gap |
| [REPLACE_SUPERSEDE_ROLLBACK.md](./REPLACE_SUPERSEDE_ROLLBACK.md) | `revertInFlightView`: stage vs replace, supersede до/после mount, detached snapshot TODO |
| [../comparison/ENGINE_ARCHITECTURE_COMPARISON.md](../comparison/ENGINE_ARCHITECTURE_COMPARISON.md) | Сравнение архитектуры engine vs Vue/RR/Angular/TanStack + roadmap (P0–P3) |
| [../POP_NAVIGATION.md](../POP_NAVIGATION.md) | Pop (Back/Forward): asymmetry, history policy, guard recipes |
| [CONTENT_RESOLVER_ARCHITECTURE.md](./CONTENT_RESOLVER_ARCHITECTURE.md) | Content resolver в `aura-route-2/core/loader` — статус, аудит, ограничения |
| [ROUTE_CONTENT_SNAPSHOT_PATCH.md](./ROUTE_CONTENT_SNAPSHOT_PATCH.md) | Точечное обновление `RouteNode.content` vs полный `refreshRoutes()` |
| [PREFETCH_NEXT_GEN.md](./PREFETCH_NEXT_GEN.md) | ISNR: Foundation ✓ · топ-3 SSR ~ · Phase C ✗ (яркие бейджи done/left) |
| [RESOURCE_GRAPH_HANDOFF.md](./RESOURCE_GRAPH_HANDOFF.md) | **TODO:** ResourceGraph prepare handoff (~30s) — prefetch→nav без `cache.*`; этапы A–E (A1 ✓) |
| [LIFECYCLE_PHASE_NAMING.md](./LIFECYCLE_PHASE_NAMING.md) | Lifecycle attrs (tiers) + **parity с мировыми роутерами** (как думать в будущем) |
| [PARAM_CHANGE_POLICY.md](./PARAM_CHANGE_POLICY.md) | **RFC:** param-change на `:id` — view-key inference (update vs full) + `param-change` override |
| [IN_PLACE_REMOUNT.md](./IN_PLACE_REMOUNT.md) | **TODO:** in-place remount — controller-first, оба cache, упрощение plan (убрать hook/view exit split) |
| [TRANSITION_ANIMATION_TESTS.md](./TRANSITION_ANIMATION_TESTS.md) | **TODO:** тесты CSS/GSAP/Web Animations — gap vs текущие transition integration (phases + DOM-слои) |
| [TRANSITION_PRESENTATION_CORE.md](./TRANSITION_PRESENTATION_CORE.md) | **TODO:** общие CSS + presentation-state для crossfade в core (сейчас reference в demo) |
| [VIEW_TRANSITIONS_API.md](./VIEW_TRANSITIONS_API.md) | View Transitions API (`startViewTransition`) — engine-обёртка, фаза 7 |
| [NAVIGATION_RUN_MANAGER.md](./NAVIGATION_RUN_MANAGER.md) | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> Transaction/Coordinator/EventBus ✓ · OutcomeHandler ✗ · узкие deps ⊘ |
| [NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md) | DOM events: что есть (`not-found`, errors, `navigation-start`/`navigation`) и roadmap (cancel, …) |
| [OPTIMISTIC_URL.md](./OPTIMISTIC_URL.md) | **✅ engine done** (resolve-first); RFC открыт: demo/e2e, stage-until-commit alternative |
| [RENDERER_ABSTRACTION.md](./RENDERER_ABSTRACTION.md) | **Фаза 6:** engine-level `Renderer.renderNode()` + централизованный `dispose`; ViewHandle ✓, engine Renderer ✗ |
| [EVENT_BUS.md](./EVENT_BUS.md) | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> callbacks + DOM errors ✓ · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> EventBus stream EB0–EB4 |
| [SSR_MPA_STRATEGY.md](./SSR_MPA_STRATEGY.md) | MPA→SPA (roadmap Phase 8) + SSR runtime как исследование (не в roadmap) |
| [SSR_SERVER_NAVIGATION_PATH.md](./SSR_SERVER_NAVIGATION_PATH.md) | ⚠️ **Под вопросом:** отдельный server navigation path (HTTP redirect, load redirect, не client pipeline) |
| [ROUTE_API_V3.md](./ROUTE_API_V3.md) | Путь as-is → [README](../README.md): `view`, loaders, lifecycle `guard\|ready`, `cache` |
| [NESTED_ROUTES_JOY_MODEL.md](./NESTED_ROUTES_JOY_MODEL.md) | Route Folders: nested DX поверх v3 — **статус реализации** (✓/~✗/⏸); redirect — последний этап |
| [PRE_RELEASE_0.0.1.md](./PRE_RELEASE_0.0.1.md) | **Чеклист:** merge в `main` + npm `@aura-ui-web/router@0.0.1` — аудит, блокеры, must-have |
| [ADOPTION_AND_GTM.md](./ADOPTION_AND_GTM.md) | Перспективы, GTM, hero README/landing, outline Vaadin→Aura migration |
| [DOCUMENT_FIRST_WC.md](./DOCUMENT_FIRST_WC.md) | **Стратегия:** document-first + WC — что «дожать», чеклист, tiered prefetch, ЦА |
| [NAVIGATION_ERROR_V2.md](./NAVIGATION_ERROR_V2.md) | **Реализовано:** обработка ошибок v2 — detection / recovery / reporting (5 фаз) |
| [navigation-error-v2.sketch.ts](./navigation-error-v2.sketch.ts) | Deprecated TS-скетч (историческая справка) |

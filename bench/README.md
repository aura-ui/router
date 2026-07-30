# Navigation performance benchmarks
Микробенчмарки для hot path aura-ui-router. Сценарии привязаны к [docs/todo/NAVIGATION_PERF_AUDIT.md](../docs/todo/NAVIGATION_PERF_AUDIT.md).
## Запуск
```bash
# все сценарии
npm run bench
# с GC между итерациями (стабильнее)
npm run bench:gc
# отдельные сценарии
npm run bench:url-matcher
npm run bench:matched-chain
npm run bench:transition-plan
npm run bench:prefetch-plan
npm run bench:dom-patch
npm run bench:route-tree
npm run bench:navigation-pipeline
npm run bench:data-graph
# существующий cache store bench
npm run bench:cache
```
Требования: Node 18+, `tsx` (devDependency). В Node < 24 нет нативного `URLPattern` — подключается `urlpattern-polyfill` через `bench/lib/dom-bootstrap.ts`. Сценарии `dom-patch` и `route-tree` используют `jsdom` из `jest-environment-jsdom`.
## Отчёты
Каждый прогон **добавляет новый файл** — история не теряется:
```text
bench/reports/
  url-matcher/
    2026-07-06T21-30-00-123Z.md   # архив (никогда не перезаписывается)
    2026-07-07T10-15-42-456Z.md   # следующий прогон — новый файл
    latest.md                      # только последний результат (удобный ярлык)
```
- **Архивные файлы** — имя = timestamp старта (с миллисекундами). Сравнивайте прогоны до/после оптимизации по diff в папке сценария.
- **`latest.md`** — перезаписывается каждый раз; для истории не используйте, только для быстрого просмотра.
При коллизии имени (два прогона в одну ms) добавится суффикс `-1`, `-2`, …
В отчёте: время start/finish, Node version, таблицы median ops/s по кейсам, CV %, spread.
## Структура
```text
bench/
  run-all.ts
  lib/
    stats.ts                 # warmup, median ops/s, CV
    report.ts                # BenchSession + save markdown
    fixtures.ts              # synthetic route trees, HTML payloads
    env.ts                   # minimal window для Node
  scenarios/
    url-matcher.bench.ts     # §1–2 URLPattern + O(n) match
    matched-chain.bench.ts   # §5 ancestor re-match
    transition-plan.bench.ts
    prefetch-plan.bench.ts   # §7 hover resolve before debounce
    dom-patch.bench.ts       # §3 innerHTML replace
    route-tree.bench.ts      # §6 buildRouteTree rebuild
    navigation-pipeline.bench.ts  # §8 canUseFastPath gate
    data-graph.bench.ts      # §13, §18–19 load parallelism
  reports/                   # generated (per-scenario folders)
```
## Сценарии ↔ аудит
| Сценарий | Audit § | Что измеряет |
|----------|---------|--------------|
| `url-matcher` | 1–2 | `matchPath` scale 10–500; `getPathParams` cold vs cached URLPattern |
| `matched-chain` | 5 | `buildMatchedRouteInfo` + `buildActiveChain`; linear chain depth 2–8 |
| `transition-plan` | — | `buildTransitionPlan` sibling / cold / exit / update |
| `prefetch-plan` | 7 | `PrefetchPlanResolver.resolve` cold/warm; hover storm |
| `dom-patch` | 3 | `replaceInner` / `updateInner` 1–50 KB HTML |
| `route-tree` | 6 | `buildRouteTree` flat + nested DOM |
| `navigation-pipeline` | 8 | `canUseFastPath` eligible vs guard vs nested |
| `data-graph` | 13, 18–19 | parallel sibling loads vs sequential hooks (no cache) |
## Интерпретация
- **ops/s** — median по 7 прогонам после warmup; выше = лучше.
- **CV %** — разброс между прогонами; >15% — шумная машина или нужен `bench:gc`.
- Сравнивайте **до/после** оптимизации на одной машине.
- `url-matcher` → `cached URLPattern` — эталон целевой формы для §1, не shipped код.
- `data-graph` использует `preserve: false`, чтобы каждая итерация реально вызывала load-хуки.
## Добавление сценария
1. `bench/scenarios/my-scenario.bench.ts` — `BenchSession`, `export function run…(): SavedReport`, `isBenchMain` guard.
2. Импорт в `bench/run-all.ts`.
3. `npm run bench:my-scenario` в `package.json`.
4. Строка в `NAVIGATION_PERF_AUDIT.md` и эту таблицу.

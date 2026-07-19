# Pre-release: merge в main и npm 0.0.1

> **Статус:** повторный аудит (2026-07-19) · первый аудит 2026-06-30  
> **Вердикт:** **ещё не готов к publish** — сборка зелёная, ядро сильно продвинулось, но **npm entry / merge в `main` / полностью зелёные тесты** ещё не закрыты  
> **Связь:** [ROADMAP](../../ROADMAP.md) · [ADOPTION_AND_GTM.md](./ADOPTION_AND_GTM.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md) · [PRE_RELEASE_0.1.0.md](./PRE_RELEASE_0.1.0.md)

Легенда: <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ частично</span> · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗ нет</span>

---

## TL;DR

Ядро зрелее, чем в июньском аудите: **`npm run build` проходит**, тесты **1097 / 1099** (было 557 / 565 с 8 падениями на WIP), CI workflow набросан, есть `CHANGELOG.md` / `LIMITATIONS.md`.

**Жёсткие блокеры сейчас:** нет публичного package entry (`exports` / `src/index.ts`), `origin/main` без кода, 2 красных теста (`pipeline-failure`), `npm run check` красный (lint), `coverage/` не в `.gitignore`.

Для **0.0.1** по semver pre-release допустим, если пакет **собирается, тесты зелёные, `npm install` работает**. Сборка ✓ · install ✗ · тесты почти ✓.

---

## Сводка по критериям

| Критерий | Статус | Комментарий |
|----------|:------:|-------------|
| `npm run build` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `tsc && vite build` — OK (бывшие 3 TS-ошибки закрыты) |
| `npm test` | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | 1097 / 1099; падают 2 в `pipeline-failure.test.ts` |
| `npm run check` (lint + build) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | ~111 errors + ~378 warnings eslint; build сам по себе зелёный |
| npm-упаковка (`exports`, entry) | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | `main: "index.js"` — файла нет; нет `exports` / `types` / `files` |
| `origin/main` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | Только `LICENSE`, `README.md`, `TRADEMARKS.md` |
| Ветка с кодом | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | `wip` / `wip-error-processing`, не смержено в `main` |
| Working tree | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Есть незакоммиченное (CI, docs, coverage, bench reports, …) |
| npm registry | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `@aura-ui-web/router` ещё не опубликован — чистый старт |
| Документация vs код | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | README всё ещё target API (`guard`/`ready`); код/demo на shipped lifecycle |
| CI | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Есть `.github/workflows/ci.yml` (build + test), но ещё не в `main` / не закоммичен |

---

## Жёсткие блокеры (P0 перед релизом)

### 1. Сборка — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

Бывшие ошибки закрыты:

| Файл | Было | Сейчас |
|------|------|--------|
| `content-loader-service.ts` | `url` unused | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> |
| `template-loader.ts` | `DocumentFragment` vs `Promise<…>` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> |
| `prefetch-policy.ts` / `RouteInstance` | `prefetchPolicy` vs `prefetch` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> |

`npm run build` проходит на текущей ветке.

### 2. Падающие тесты — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ старые 8 ✓ · новые 2 ✗</span>

**Закрыто (июньский WIP):**

| Suite | Статус |
|-------|--------|
| `test/prefetch/intent.test.ts` (4) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> — тесты передают `LinkIntentSourceConfig` |
| `test/content/loader-registry.test.ts` (3) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> |
| `test/prefetch/prefetch-pipeline.test.ts` (1) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> |

**Открыто (2026-07-19):**

| Suite | Причина |
|-------|---------|
| `pipeline-failure.test.ts` (2) | `context.viewCommitTracker` — `undefined` в моке при вызове `handlePipelineFailure` |

Итого: **1097 / 1099**. До must-have — починить эти 2 (или дописать мок `viewCommitTracker`).

### 3. npm-пакет — <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

В `package.json` на текущей ветке:

- `"main": "index.js"` — файла нет
- нет `exports`, `types`, `module`, `files`
- нет `prepack` / `prepublishOnly`
- нет публичного barrel `src/index.ts` → `import { AuraRouter } from '@aura-ui-web/router'`

Даже при зелёной сборке `npm install @aura-ui-web/router` сейчас не сработает.  
(Черновик surface есть в [PRE_RELEASE_0.1.0.md](./PRE_RELEASE_0.1.0.md) — перенести/закрыть и здесь.)

### 4. Git / main — <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

- `origin/main` — только юридические/маркетинговые файлы, **кода нет**
- Реализация в `wip` / `wip-error-processing`
- В working tree — незакоммиченные артефакты (`coverage/`, `bench/reports/`, …)
- `coverage/` **не** в `.gitignore` — не тащить в main

---

## Мягкие блокеры (качество 0.0.1)

### API: README vs код — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span>

README всё ещё описывает target API (`guard`, `ready`, …). Для 0.0.1 терпимо, если явно помечено **experimental** и указаны **актуальные** attrs (см. также чеклист 0.1.0).

| README (target) | Код / demo |
|-----------------|------------|
| `guard`, `ready` | shipped: `enter`, `after`, … |
| `view="html::..."` | `view` есть |

### ROADMAP

Фазы в процессе — pre-alpha по задумке. Для `0.0.1` ок при пометке **experimental**.

### Lint — <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

~489 problems (`no-explicit-any`, import order и др.) — `npm run check` красный. На runtime не влияет, но gate для релиза лучше закрыть или явно отложить.

### CI — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ файл есть</span>

Есть `.github/workflows/ci.yml` (`npm ci` → `build` → `test` на push/PR в `main`/`master`). Нужно закоммитить и после merge реально гонять на `main`.

---

## Что уже хорошо

- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm run build` зелёный**
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **~1100 тестов** — engine, lifecycle, prefetch, view, hooks, navigation outcome/failure
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> Закрыт июньский WIP по prefetch / loader registry / TS-ошибкам
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> Архитектура и design docs; демо (`index.html`, `public/features/…`)
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `CHANGELOG.md`, `LIMITATIONS.md`
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `version: "0.0.1"` в `package.json`, MIT, commitlint, husky
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> Черновик CI workflow
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> npm ещё не занят — можно выбрать момент первой публикации

---

## Чеклист перед merge в main и npm 0.0.1

### Must-have (без этого не публиковать)

- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> **Зелёная сборка** — 3 TS-ошибки закрыты; `prefetch` / `RouteInstance` выровнены
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **Зелёные тесты** — старые 8 ✓; осталось **2** в `pipeline-failure.test.ts` → цель **1099/1099**
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **Entry point** — `src/index.ts` (или аналог), `package.json`: `exports`, `types`, `files`; `prepublishOnly`: `npm run build`
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **Merge wip → main** — без `coverage/`, без черновиков и `__pycache__`
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **Smoke:** `npm pack` → установка tarball в чистый проект → `import { AuraRouter }` + минимальный HTML

### Should-have (качество pre-release)

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **Docs sync** — в README: актуальные attrs (`enter`/`after` vs target `guard`/`ready`)
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **CI** — workflow файл есть; закоммитить + гонять на `main` после merge
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **`.gitignore`** — `coverage/` (и по желанию `bench/reports/`, `__pycache__`)
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **`npm run check`** — довести lint до зелёного или временно исключить только то, что осознанно откладывается (с записью здесь)

### Nice-to-have

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Тег `v0.0.1` + GitHub Release с пометкой **experimental**
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `0.0.1-alpha.0` на npm для dry-run публикации до финального тега
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Ссылка из [ROADMAP](../../ROADMAP.md) Phase 7 на этот чеклист

---

## Рекомендуемый порядок работ

```text
1. Починить 2 теста pipeline-failure (мок viewCommitTracker)
2. Настроить package exports + src/index.ts + smoke npm pack
3. .gitignore coverage/; закоммитить CI
4. Синхронизировать минимум docs (актуальные attrs) — или явно «target API»
5. Merge в main, CI зелёный на remote, tag v0.0.1, npm publish
```

**Оценка:** после entry point + 2 теста — реалистично выйти на **0.0.1 experimental**. Дальнейший polish → [PRE_RELEASE_0.1.0.md](./PRE_RELEASE_0.1.0.md).

---

## Команды для повторной проверки

```bash
npm test
npm run build
npm run check    # lint + build
npm pack --dry-run
git status
```

Повторить аудит после закрытия чеклиста must-have.

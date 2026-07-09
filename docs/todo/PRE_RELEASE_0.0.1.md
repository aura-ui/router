# Pre-release: merge в main и npm 0.0.1

> **Статус:** аудит готовности (2026-06-30)  
> **Вердикт:** **не готов** — публиковать в `main` и выкладывать `@aura-ui-web/router@0.0.1` сейчас рано  
> **Связь:** [ROADMAP](../../ROADMAP.md) · [ADOPTION_AND_GTM.md](./ADOPTION_AND_GTM.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md)

---

## TL;DR

Ядро зрелое для experimental pre-release (557 тестов, продуманная архитектура, демо), но есть **жёсткие блокеры**: сборка падает, 8 тестов красные, npm entry point не настроен, весь код ещё не в `main`.

Для **0.0.1** по semver pre-release допустим, если пакет **собирается, тесты зелёные, `npm install` работает**. Сейчас — нет.

---

## Сводка по критериям

| Критерий | Статус | Комментарий |
|----------|:------:|-------------|
| `npm run build` | ✗ | 3 ошибки TypeScript |
| `npm test` | ~ | 557 / 565 проходят, 8 падают |
| `npm run check` (lint + build) | ✗ | ~240 ошибок eslint + build |
| npm-упаковка (`exports`, entry) | ✗ | `main: "index.js"` — файла нет |
| `origin/main` | ✗ | Только `LICENSE`, `README.md`, `TRADEMARKS.md` |
| Ветка с кодом | ~ | `wip` / `wip-error-processing`, не смержено |
| Working tree | ~ | Незакоммиченный WIP (prefetch-policy, data-cache, …) |
| npm registry | ✓ | `@aura-ui-web/router` ещё не опубликован — чистый старт |
| Документация vs код | ~ | README описывает target API; код частично отстаёт |
| CI | ✗ | Нет `.github/workflows` |

---

## Жёсткие блокеры (P0 перед релизом)

### 1. Сборка

`npm run build` (`tsc && vite build`) падает:

| Файл | Ошибка |
|------|--------|
| `src/modules/aura-content-loaders/core/content-loader-service.ts` | `url` объявлен, но не используется |
| `src/modules/aura-content-loaders/core/template-loader.ts` | `DocumentFragment` вместо `Promise<DocumentFragment>` |
| `src/modules/aura-routing-engine/core/prefetch/prefetch-policy.ts` | `prefetchPolicy` не в типе `RouteInstance` |

Последняя — незавершённый рефакторинг prefetch: в `AuraRoute` поле `prefetchPolicy`, в `RouteInstance` — `prefetch?`, в `resolvePrefetchMode` читается `prefetchPolicy`.

### 2. Падающие тесты (8)

| Suite | Причина |
|-------|---------|
| `test/prefetch/intent.test.ts` (4) | `LinkIntentSource` теперь требует `config: LinkIntentSourceConfig`, тесты вызывают `new LinkIntentSource(bus)` |
| `test/content/loader-registry.test.ts` (3) | API registry изменился (`getRegisteredTypes`, `has`, `BUILTIN_LOADER_IDS`) |
| `test/prefetch/prefetch-pipeline.test.ts` (1) | Data cache: ожидался 1 load, получено 2 |

Похоже на **незавершённый рефакторинг**, не на флаки.

### 3. npm-пакет

В `package.json`:

- `"main": "index.js"` — файла нет
- нет `exports`, `types`, `module`, `files`
- нет `prepack` / `prepublishOnly`
- `tsc` пишет в `dist/`, но публичный barrel для `import { AuraRouter } from '@aura-ui-web/router'` не описан

Даже при зелёной сборке `npm install @aura-ui-web/router` сейчас не сработает.

### 4. Git / main

- `origin/main` — только юридические/маркетинговые файлы, **кода нет**
- Реализация в `wip` (~270 файлов, +41k строк vs main)
- В working tree — незакоммиченные изменения
- `coverage/` не в `.gitignore` — не тащить в main

---

## Мягкие блокеры (качество 0.0.1)

### API: README vs код

README честно помечен как **target API** (*«pre-release build may lag behind»*), но расхождение заметное:

| README (target) | Код сейчас |
|-----------------|------------|
| `guard`, `ready` | `enter`, `after` |
| `view="html::..."` | `view` есть; `aura-router/README.md` ещё на `source` + `data-content` |

Для 0.0.1 терпимо, если ожидания снижены и в README явно указаны **актуальные** attrs.

### ROADMAP

Фазы 1–5 — `~` (в процессе), 4/6/8 — `✗`. Это pre-alpha по задумке, не GA. Для `0.0.1` ок при пометке **experimental**.

### Lint

~240 ошибок eslint (`no-explicit-any`, import order и др.) — `npm run check` красный. На runtime не влияет, но gate для релиза лучше закрыть.

### CI

Нет автоматического `test` + `build` на push — регрессии ловятся вручную.

---

## Что уже хорошо

- **557 тестов** — engine, lifecycle, prefetch, view, hooks
- Архитектура и design docs
- Демо (`index.html`, `src/examples/demo`)
- `version: "0.0.1"` в `package.json`, MIT, commitlint, husky
- npm ещё не занят — можно выбрать момент первой публикации

---

## Чеклист перед merge в main и npm 0.0.1

### Must-have (без этого не публиковать)

- [ ] **Зелёная сборка** — починить 3 TS-ошибки; выровнять `prefetch` / `prefetchPolicy` в `RouteInstance` и реализации
- [ ] **Зелёные тесты** — 565/565; обновить тесты под новый API `LinkIntentSource`, `LoaderRegistry`, data-cache в prefetch pipeline
- [ ] **Entry point** — `src/index.ts` (или аналог), `package.json`: `exports`, `types`, `files`; `prepublishOnly`: `npm run build`
- [ ] **Merge wip → main** — без `coverage/`, без черновиков и `__pycache__`
- [ ] **Smoke:** `npm pack` → установка tarball в чистый проект → `import { AuraRouter }` + минимальный HTML

### Should-have (качество pre-release)

- [ ] **Docs sync** — в README или отдельной таблице: актуальные attrs (`enter`/`after` vs target `guard`/`ready`); обновить `aura-router/README.md`
- [ ] **CI** — GitHub Actions: `npm test`, `npm run build` (опционально `lint` после чистки)
- [ ] **`.gitignore`** — `coverage/`
- [ ] **`npm run check`** — довести lint до зелёного или временно исключить только то, что осознанно откладывается (с записью в этом doc)

### Nice-to-have

- [ ] Тег `v0.0.1` + GitHub Release с пометкой **experimental**
- [ ] `0.0.1-alpha.0` на npm для dry-run публикации до финального тега
- [ ] Ссылка из [ROADMAP](../../ROADMAP.md) Phase 7 на этот чеклист

---

## Рекомендуемый порядок работ

```text
1. Закрыть WIP (prefetch-policy, data-cache, RouteInstance types)
2. Починить build + все тесты
3. Настроить package exports + smoke npm pack
4. Синхронизировать минимум docs (актуальные attrs)
5. Merge в main, CI, tag v0.0.1, npm publish
```

**Оценка:** 1–2 итерации после закрытия текущего WIP — реалистично выйти на **0.0.1 experimental**.

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

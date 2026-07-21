# Pre-release: merge в main и npm 0.0.1

> **Статус:** повторный аудит (2026-07-20, вечер) · предыдущие 2026-07-20 утро / 2026-07-19 · первый 2026-06-30  
> **Вердикт:** **ещё не готов к publish** — сборка, тесты, check и локальный npm surface зелёные, но **entry-файлы не в git**, **merge в `main` нет**, **CI / `coverage/` не закрыты**  
> **Связь:** [ROADMAP](../../ROADMAP.md) · [ADOPTION_AND_GTM.md](./ADOPTION_AND_GTM.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md) · [PRE_RELEASE_0.1.0.md](./PRE_RELEASE_0.1.0.md)

Легенда: <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ частично</span> · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗ нет</span>

---

## TL;DR

Прогресс с утра: в `package.json` уже есть `exports` / `types` / `files` / `prepublishOnly`, есть `scripts/build-lib.mjs` + `smoke-dist.mjs`, локально `dist/` собирается, smoke и `npm pack` проходят.

**Что осталось перед publish:**

1. **Закоммитить** `src/index.ts`, `tsconfig.build.json`, `vite.lib.config.ts` (без них clean clone ломает `npm run build`)
2. **`.gitignore`:** `coverage/` (и по желанию `bench/reports/`, `docs/**/__pycache__`)
3. **Закоммитить CI** (`.github/workflows/ci.yml`)
4. **Merge → `main`** без мусора (`coverage/`, `__pycache__`, лишние черновики)
5. **Smoke в чистом проекте** (tarball → `import { AuraRouter }`)
6. Tag / npm publish (nice-to-have: `0.0.1-alpha.0` dry-run)

Сборка ✓ · тесты ✓ · check ✓ · pack/smoke локально ✓ · git-complete entry ✗ · main ✗.

---

## Сводка по критериям

| Критерий | Статус | Комментарий |
|----------|:------:|-------------|
| `npm run build` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `node scripts/build-lib.mjs` → `dist/` (JS + `.d.ts`) |
| `npm test` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | **1099 / 1099**, 146 suites |
| `npm run check` (lint + build) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | 0 eslint errors; ~79 warnings |
| npm-упаковка (`exports`, entry) | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | `package.json` + build/smoke scripts **в git**; `src/index.ts` + `tsconfig.build.json` + `vite.lib.config.ts` **только на диске** |
| `npm pack` / smoke dist | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | pack ~376 kB; `node scripts/smoke-dist.mjs` → CE зарегистрированы |
| Smoke в чистом проекте | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | tarball → install вне репо ещё не прогнан |
| `origin/main` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | Только `LICENSE`, `README.md`, `TRADEMARKS.md` |
| Ветка с кодом | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | `wip-error-processing` (ahead of origin), не смержено в `main` |
| Working tree | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Untracked: entry/build configs, CI, docs, `coverage/`, `bench/reports/`, … |
| npm registry | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Имя занято stub `@auraui/router@0.0.0`; реальный `0.0.1` ещё не опубликован |
| Документация vs код | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Lifecycle attrs уже `guard`/`load`/`ready` (код = README); нет явной пометки **experimental** |
| CI | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | `.github/workflows/ci.yml` есть, **не закоммичен** |
| `.gitignore` → `coverage/` | <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> | В working tree добавлен только `.tmp`; `coverage/` всё ещё нет |

---

## Жёсткие блокеры (P0 перед релизом)

### 1. Сборка — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

Бывшие TS-ошибки закрыты. `npm run build` = lib emit (`tsc -p tsconfig.build.json` + `vite.lib.config.ts`).

### 2. Тесты — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

**1099 / 1099** (в т.ч. prefetch / loader registry / `pipeline-failure` / lifecycle).

### 3. npm-пакет — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ почти готов</span>

**Уже в git** (`ec4fad4` и след.):

- `package.json`: `main`/`module`/`types` → `./dist/…`, `exports`, `files`, `sideEffects`, `publishConfig`, `prepublishOnly`
- `scripts/build-lib.mjs`, `scripts/smoke-dist.mjs`

**Локально работает, но не в git (блокер merge/CI):**

| Файл | Нужен для |
|------|-----------|
| `src/index.ts` | public barrel → `dist/index.js` |
| `tsconfig.build.json` | emit `.d.ts` |
| `vite.lib.config.ts` | ESM preserveModules |

Без коммита этих трёх файлов `npm run build` на чистом checkout упадёт.

**Smoke:**

- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `node scripts/smoke-dist.mjs` — `AuraRouter` / `AuraRoute` / `AuraOutlet` / `defineRouteHook`, CE install
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `npm pack --dry-run` — tarball собирается
- <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> установка tarball в **пустой** Vite/Node проект

### 4. Git / main — <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span>

- `origin/main` — только юридические/маркетинговые файлы, **кода нет**
- Реализация в `wip-error-processing` (ahead of `origin/wip-error-processing`)
- Working tree: untracked entry/build configs, CI, docs, `coverage/`, `bench/reports/`, `__pycache__`
- `coverage/` **не** в `.gitignore` — не тащить в main

---

## Мягкие блокеры (качество 0.0.1)

### API / README — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span>

Старый разрыв `enter`/`after` vs `guard`/`ready` **снят**: код (`PHASES`) и README совпадают на `guard` / `load` / `ready` / `leave` / …

Осталось для 0.0.1:

- явная пометка **experimental** / pre-alpha в README
- по желанию поправить устаревшую строку в CHANGELOG про `build` (`tsc && vite build` → `scripts/build-lib.mjs`)

### ROADMAP

Фазы в процессе — pre-alpha по задумке. Для `0.0.1` ок при пометке **experimental**.

### Lint / `npm run check` — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

0 errors; ~79 warnings (`no-console`, `no-explicit-any`, …) — не валят `check`.

### CI — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ файл есть</span>

`.github/workflows/ci.yml` (`npm ci` → `build` → `test` на push/PR в `main`/`master`). Нужно закоммитить; после merge реально гонять на `main`.

---

## Что уже хорошо

- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm run build` зелёный** (lib emit → `dist/`)
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm test` 1099 / 1099**
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm run check` зелёный**
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`package.json` surface** — `exports` / `types` / `files` / `prepublishOnly`
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **Локальный smoke** (`smoke-dist.mjs`) + `npm pack`
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> Lifecycle attrs выровнены README ↔ код (`guard`/`ready`/…)
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `CHANGELOG.md`, `LIMITATIONS.md`, MIT, commitlint, husky
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> Черновик CI workflow
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> npm имя свободно

---

## Чеклист перед merge в main и npm 0.0.1

### Must-have (без этого не публиковать)

- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> **Зелёная сборка**
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> **Зелёные тесты** — **1099 / 1099**
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> **`npm run check`** — 0 eslint errors
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`package.json` entry fields** — `exports` / `types` / `files` / `prepublishOnly`
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **Entry source в git** — закоммитить `src/index.ts` + `tsconfig.build.json` + `vite.lib.config.ts`
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **Merge wip → main** — без `coverage/`, без `__pycache__`, без случайных `.tmp`
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **Smoke вне репо:** `npm pack` → install tarball в чистый проект → `import { AuraRouter }` + минимальный HTML

### Should-have (качество pre-release)

- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **Docs** — пометить README **experimental**; по желанию поправить CHANGELOG про `build`
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **CI** — закоммитить `.github/workflows/ci.yml`; зелёный прогон на `main` после merge
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> **`.gitignore`** — `coverage/` (+ опционально `bench/reports/`, `__pycache__`)
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **Lint warnings** — ~79; не блокируют, можно дочистить позже

### Nice-to-have

- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Тег `v0.0.1` + GitHub Release с пометкой **experimental**
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> `0.0.1-alpha.0` на npm для dry-run до финального тега
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Ссылка из [ROADMAP](../../ROADMAP.md) Phase 7 на этот чеклист

---

## Рекомендуемый порядок работ

```text
1. git add src/index.ts tsconfig.build.json vite.lib.config.ts
   (+ .github/workflows/ci.yml, .gitignore с coverage/)
2. Убедиться: clean build + smoke-dist + npm pack
3. Smoke tarball в пустом проекте
4. README: experimental; merge в main; CI зелёный
5. tag v0.0.1 → npm publish (или сначала 0.0.1-alpha.0)
```

**Оценка:** после коммита entry-файлов + smoke вне репо — реалистично выйти на **0.0.1 experimental**. Дальнейший polish → [PRE_RELEASE_0.1.0.md](./PRE_RELEASE_0.1.0.md).

---

## Команды для повторной проверки

```bash
npm test
npm run build
npm run check
node scripts/smoke-dist.mjs
npm pack --dry-run
git status
# после коммита entry — clean clone / worktree и снова npm run build
```

Повторить аудит после закрытия must-have (особенно «entry в git» + merge).

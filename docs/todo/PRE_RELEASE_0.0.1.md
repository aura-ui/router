# Pre-release: merge в main и npm 0.0.1

> **Статус:** повторный аудит (2026-07-21, вечер) · предыдущие 2026-07-20 / 2026-07-19 · первый 2026-06-30  
> **Вердикт:** **ещё не готов к publish** — сборка, тесты, lint/check, pack/smoke зелёные; entry/CI/gitignore закрыты; README помечен **experimental**. Перед publish: закоммитить eslint ignores + README, **влить в `main`**, затем tag/npm. Stub на registry (`0.0.0`) и stub `main` — **ожидаемо**, publish только после merge.  
> **Связь:** [ROADMAP](../../ROADMAP.md) · [ADOPTION_AND_GTM.md](./ADOPTION_AND_GTM.md) · [ROUTE_API_V3.md](./ROUTE_API_V3.md) · [PRE_RELEASE_0.1.0.md](./PRE_RELEASE_0.1.0.md)

Легенда: <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> · <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ частично</span> · <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗ нет</span>

---

## TL;DR

С прошлой проверки закрыты бывшие P0 по git-completeness: `src/index.ts`, `tsconfig.build.json`, `vite.lib.config.ts`, CI и `coverage/` в `.gitignore` **уже в git** (ветка `wip-error-processing` синхронна с origin).

**Что осталось перед publish:**

1. Закоммитить `eslint.config.mjs` + README (**experimental**) + этот чеклист
2. По желанию: правка CHANGELOG про `build` / packaging
3. **Merge → `main`** — stub `main` ожидаем; не тащить `reserve/` и лишние черновики
4. Tag / npm publish **после merge в main** (nice-to-have: `0.0.1-alpha.0` dry-run). Stub registry `0.0.0` — ок

Сборка ✓ · тесты ✓ · lint/check ✓ · pack/smoke ✓ · experimental README ✓ · entry/CI/gitignore ✓ · commit local diffs · merge → потом npm.

---

## Сводка по критериям

| Критерий | Статус | Комментарий |
|----------|:------:|-------------|
| `npm run build` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `node scripts/build-lib.mjs` → `dist/` (JS + `.d.ts`); app gzip ~31.7 kB |
| `npm test` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | **1099 / 1099**, 146 suites |
| `npm run lint` / `check` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | 0 errors / ~79 warnings; `check` = lint + build + smoke — exit 0 |
| npm-упаковка (`exports`, entry) | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `package.json` + entry + build configs **в git** (`40c23a6` и след.) |
| `npm pack` / smoke dist | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | pack ~175 kB; `npm run smoke` → CE зарегистрированы |
| Smoke в чистом проекте | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `playground/` ставит `../auraui-router-0.0.1.tgz` и `import { AuraRouter }` + esbuild bundle |
| `origin/main` | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Stub: LICENSE / README / TRADEMARKS — **ожидаемо**; первый merge кода ещё впереди |
| Ветка с кодом | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `wip-error-processing` = `origin/wip-error-processing`; ~696 commits ahead of `main` |
| Working tree | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Untracked: черновики `docs/*`, `playground/static/`, `reserve/`; modified: `eslint.config.mjs`, `docs/todo/PRE_RELEASE_0.0.1.md` |
| npm registry | <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> | Stub `@auraui/router@0.0.0` — **ожидаемо**; `0.0.1` публикуем только после merge в `main` |
| Документация vs код | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | Lifecycle attrs `guard`/`load`/`ready`; README — **Experimental (pre-alpha)** |
| CI | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | `.github/workflows/ci.yml` **в git** (build → smoke → size → test); зелёный прогон на `main` после merge |
| `.gitignore` → `coverage/` | <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> | Есть `coverage/`, `bench/reports/`, `__pycache__/`, `.tmp` |

---

## Жёсткие блокеры (P0 перед релизом)

### 1. Сборка — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

`npm run build` = lib emit (`tsc -p tsconfig.build.json` + `vite.lib.config.ts`).

### 2. Тесты — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

**1099 / 1099** (в т.ч. prefetch / loader registry / `pipeline-failure` / lifecycle).

### 3. npm-пакет — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> (локально)

В git: `exports` / `types` / `files` / `prepublishOnly`, `src/index.ts`, `tsconfig.build.json`, `vite.lib.config.ts`, `scripts/build-lib.mjs`, `scripts/smoke-dist.mjs`.

**Smoke:**

- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `npm run smoke` — `AuraRouter` / `AuraRoute` / `AuraOutlet` / `defineRouteHook`, CE install
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `npm pack --dry-run` — tarball ~175 kB
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **playground** — отдельный package: `"@auraui/router": "../auraui-router-0.0.1.tgz"`, `import { AuraRouter }` в `src/main.js`, esbuild → `static/main.js`

### 4. Lint / `npm run check` — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span>

- 0 errors, ~79 warnings в `src/` (не валят exit)
- `eslint.config.mjs` ignores: `playground/**`, `.tmp/**`, `.size-limit.cjs` — **локально**, ещё не закоммичено
- `npm run check` (lint + build + smoke) — **exit 0**

### 5. Git / main — <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~ ожидаемый шаг</span>

- `origin/main` — legal/README stub; **не баг**, код готовится к первому влитию
- Реализация в `wip-error-processing` (synced with origin)
- Перед merge: не тащить `reserve/`, случайный `playground/static/`; черновики `docs/*` — осознанно
- После merge — CI на `main` реально прогонит workflow

---

## Мягкие блокеры (качество 0.0.1)

### API / README — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span>

Код и README совпадают на `guard` / `load` / `ready` / `leave` / …  
README: **Experimental (pre-alpha)** — API может меняться до `0.1.0`.

По желанию: поправить устаревшую строку в CHANGELOG про `build` (`tsc && vite build` → `scripts/build-lib.mjs`) и claim про unfinished packaging.

### ROADMAP

Фазы в процессе — pre-alpha по задумке. Ссылка Phase 7 → этот чеклист ещё не добавлена.

### CI — <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ файл в git</span>

После merge реально гонять на `main` / PR.

---

## Что уже хорошо

- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm run check` зелёный** (lint 0 errors + build + smoke)
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm run build` зелёный** (lib emit → `dist/`)
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm test` 1099 / 1099**
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`package.json` surface** + **entry source в git**
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **Локальный smoke** + `npm pack` + playground ← tarball
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> Lifecycle attrs выровнены README ↔ код
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `CHANGELOG.md`, `LIMITATIONS.md`, MIT, commitlint, husky
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> CI workflow **закоммичен**
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> `.gitignore` закрывает `coverage/` / reports / `__pycache__`
- <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> npm имя занято stub’ом `0.0.0` (publish `0.0.1` — после merge в `main`)

---

## Чеклист перед merge в main и npm 0.0.1

### Must-have (без этого не публиковать)

- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> **Зелёная сборка**
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓ ГОТОВО</span> **Зелёные тесты** — **1099 / 1099**
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`package.json` entry fields** + **entry source в git**
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`npm run check`** — 0 eslint errors; ignores для `playground/**` / `.tmp/**` / `.size-limit.cjs` (закоммитить `eslint.config.mjs` перед merge)
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **Merge wip → main** — следующий шаг (main сейчас stub); без `reserve/` и случайного мусора
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **Smoke вне lib:** playground ← tarball (`npm pack` → `playground` deps → `import { AuraRouter }`)

### Should-have (качество pre-release)

- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **Docs** — README **experimental** (по желанию ещё CHANGELOG build/packaging)
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **CHANGELOG** — sync строки про `build` / packaging (опционально)
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **CI файл в git** — осталось: зелёный прогон на `main` после merge
- [x] <span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">✓</span> **`.gitignore`** — `coverage/` (+ reports / `__pycache__`)
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> **Lint warnings** — ~79 в `src/`; не блокируют

### Nice-to-have

- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> Тег `v0.0.1` + GitHub Release (**после** merge; experimental)
- [ ] <span style="background:#f59e0b;color:#111;padding:2px 8px;border-radius:4px;font-weight:700">~</span> npm publish `0.0.1` (**после** merge; опционально сначала `0.0.1-alpha.0`) — stub `0.0.0` на registry ок
- [ ] <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">✗</span> Ссылка из [ROADMAP](../../ROADMAP.md) Phase 7 на этот чеклист

---

## Рекомендуемый порядок работ

```text
1. Закоммитить eslint.config.mjs + README experimental + PRE_RELEASE doc
2. (опц.) CHANGELOG sync
3. Merge в main; CI зелёный
4. tag v0.0.1 → npm publish (или сначала 0.0.1-alpha.0)
```

**Оценка:** после commit + merge — реалистично выйти на **0.0.1 experimental**. Дальнейший polish → [PRE_RELEASE_0.1.0.md](./PRE_RELEASE_0.1.0.md).

---

## Команды для повторной проверки

```bash
npm test
npm run build
npm run lint
npm run check
npm run smoke
npm pack --dry-run
git status
# consumer smoke: npm pack && cd playground && npm i && npm run build
```

Повторить аудит после docs + merge.

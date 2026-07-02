# RFC: Search schema (`search` attr + `useSearchSchema`)

> **Статус:** draft (RFC)  
> **Дата:** 2026-07-02  
> **Связано:** [TANSTACK_ROUTER_COMPARISON.md](../comparison/TANSTACK_ROUTER_COMPARISON.md) · [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) · [HOOKS.md](../HOOKS.md)

---

## О чём этот документ

Предложение **first-class search params** для Aura Router в духе TanStack `validateSearch` + `loaderDeps`, **без отказа от HTML-маршрутов**.

**Ключевая идея:** в разметке — **имя схемы**, в TypeScript — **parse/validate/coerce**. Как `enter="auth"` / `load="fetch-user"`, не как inline JSON в HTML.

---

## Проблема

### Что уже работает (не решаем этим RFC)

| Сценарий | Aura сейчас |
|----------|-------------|
| Shareable URL `?page=2&sort=price` | ✅ полный href в history |
| Back/Forward с query | ✅ `popstate` → match |
| `load` читает query | ✅ `ctx.to.query` на leaf |

### Что болит

1. **Валидация дублируется** в каждом `load`-хуке (`page=abc` → ручной parse).
2. **Cache key DataGraph** включает **весь** raw query — `utm_*` ломает hit rate.
3. **`navigate()`** — только строка; легко ошибиться при merge search.
4. **Нет strict mode** — лишние ключи в URL проходят silently.
5. **Prefetch / match** используют raw strings — нельзя централизованно redirect на «канонический» search.

---

## Цели (v1)

| # | Цель |
|---|------|
| G1 | Именованная search-схема на route (`search="…"`) + registry |
| G2 | Validate/coerce **до** `enter` / `load` |
| G3 | `ctx.to.query` — validated object; optional `ctx.to.rawQuery` |
| G4 | `search-deps` — subset ключей для DataGraph cache key |
| G5 | `router.navigate(path, { search })` — object merge/replace |
| G6 | Наследование attr router → route (как `scroll`, `prefetch`) |

## Не-цели (v1)

- Полный typed route tree / codegen (отдельный RFC).
- Reactive `useSearch()` hook (нет React; позже — events / store).
- SSR validate на сервере (Phase 2).
- Zod **в core** — optional adapter, не hard dependency.

---

## Публичный API

### HTML

```html
<aura-router search="app-search">
  <aura-route
    path="/products"
    search="products-filters"
    search-deps="page,sort,category"
    load="fetch-products"
    preserve="data"
  ></aura-route>
</aura-router>
```

| Attr | Наследование | Описание |
|------|--------------|----------|
| `search` | ✅ inherit | Имя схемы в registry (kebab-case). Пусто = только raw query, без validate. |
| `search-deps` | ✅ inherit | Список ключей validated query для cache key DataGraph. Пусто = все ключи схемы. |
| `search-strict` | ✅ inherit | `"true"` / `"false"`. Default inherit → `"false"`. Отбрасывать unknown keys после validate. |

Leaf route **перебивает** router default. Layout без `search` наследует от `<aura-router>`.

### Registry

```ts
import { z } from 'zod';
import { AuraRouter, defineSearchSchema } from '@aura-ui-web/router';

const productsSearch = z.object({
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(['name', 'price']).default('name'),
  category: z.string().max(64).default('all'),
});

AuraRouter.useSearchSchema(
  defineSearchSchema({
    name: 'products-filters',
    schema: productsSearch,
    // или fn: (raw) => ({ ... })
    onInvalid: 'coerce', // 'coerce' | 'redirect' | 'not-found'
  }),
);
```

```ts
/** Author-time helper — mirror defineRouteHook */
export function defineSearchSchema<TOut extends Record<string, unknown>>(def: {
  name: string;
  version?: string;
  fn?: (raw: Record<string, string>, ctx: SearchValidateContext) => TOut;
  schema?: { parse: (raw: unknown) => TOut }; // Zod / Valibot / custom
  strict?: boolean;
  onInvalid?: 'coerce' | 'redirect' | 'not-found';
}): SearchSchemaDefinition<TOut>;
```

Static methods (symmetry с hooks):

```ts
AuraRouter.useSearchSchema(def, options?);
AuraRouter.unuseSearchSchema(name): boolean;
```

### Navigate

Расширение `RouterInstance` (backward compatible):

```ts
router.navigate('/products', {
  replace: true,
  search: { page: 2, sort: 'price' },       // merge с текущим search
  replaceSearch: false,                      // default: merge
});

router.navigate('/products', {
  search: { page: 1 },
  replaceSearch: true,                       // заменить search целиком
});
```

Serialization: `URLSearchParams` — только defined keys; `null` удаляет ключ.

---

## Pipeline: где validate

```text
match pathname (URLPattern)
  → parse raw query (URLSearchParams)           ← уже есть
  → attachNavigationChain
  → resolveSearchSchema(leaf route)             ← NEW
  → SearchValidator.validate(raw, schema)
  → MatchedRouteInfo.validatedQuery             ← NEW
  → buildTransitionPlan / guards / loads
```

**Порядок относительно TanStack:**

| TanStack | Aura (proposal) |
|----------|-----------------|
| `validateSearch` после match, до `beforeLoad` | после match, **до `enter`** |
| `loaderDeps` в loader cache | `search-deps` в `buildRouteDataKey` |

Validate **не** в `load`-хуке — один раз на navigation/prefetch match.

### Prefetch

Тот же validator на prefetch plan → warmed cache key использует **validated + deps**, не raw.

---

## Модель данных

### `MatchedRouteInfo`

```ts
interface MatchedRouteInfo {
  // ...
  /** Raw strings from URL — audit / redirect canonicalization */
  rawQuery?: Record<string, string>;
  /** After search schema; falls back to rawQuery when no schema */
  query?: Record<string, unknown>;
}
```

### `RouteInfo` (lifecycle ctx)

```ts
interface RouteInfo {
  pathname: string;
  params?: Record<string, string>;
  /** Validated search (object). Hooks should use this. */
  query?: Record<string, unknown>;
  /** Present when schema active */
  rawQuery?: Record<string, string>;
}
```

### `RouteInstance` (aura-route)

```ts
interface RouteInstance {
  readonly searchSchema?: string | null;      // attr `search`
  readonly searchDeps?: readonly string[] | null;
  readonly searchStrict?: boolean;
}
```

---

## Search registry

Новый модуль: `src/modules/aura-routing-engine/core/search/`

```text
search/
  types.ts           — SearchSchemaDefinition, SearchValidateResult
  registry.ts        — SearchSchemaRegistry (parallel HookRegistry)
  validator.ts       — run validate, strict strip, onInvalid policies
  resolve-schema.ts  — inherit attr from route chain leaf → router
  serialize-search.ts — object → URLSearchParams for navigate
  index.ts
```

### Validate result

```ts
type SearchValidateResult =
  | { ok: true; query: Record<string, unknown> }
  | { ok: false; kind: 'redirect'; href: string; replace?: boolean }
  | { ok: false; kind: 'not-found' };
```

### Policies `onInvalid`

| Policy | `?page=abc` |
|--------|-------------|
| `coerce` (default) | schema defaults / Zod coerce → `{ page: 1, … }` |
| `redirect` | `replace` navigate на canonical URL (same path, fixed search) |
| `not-found` | NOT_FOUND navigation (как unmatched path) |

---

## DataGraph: `search-deps`

Сейчас (`route-data.ts`):

```ts
// весь raw query в ключе
if (route.query && Object.keys(route.query).length) {
  parts.push(encodeRecord(route.query));
}
```

Proposal:

```ts
function searchCacheSlice(
  route: MatchedRouteInfo,
  query: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const deps = resolveSearchDeps(route); // attr search-deps or all schema keys
  if (!query || !deps?.length) return query as Record<string, string> | undefined;
  return pick(query, deps);
}
```

Ключ кэша строится из **slice**, не full URL query.

**Пример:**

```text
URL: /products?page=2&utm=email&sort=price
search-deps: page,sort
cache key query part: page=2&sort=price   (utm ignored)
```

---

## Strict mode

После successful parse:

```ts
if (strict) {
  query = pick(query, schemaKnownKeys);
}
```

Unknown keys из raw URL **не попадают** в `ctx.to.query`. Raw остаётся в `rawQuery` для debug.

---

## Наследование

Аналог `scroll` / `prefetch`:

```text
resolveSearchPolicy(route chain leaf):
  1. leaf.searchSchema ?? walk up inherited attrs
  2. leaf.searchDeps ?? inherited
  3. leaf.searchStrict ?? inherited ?? false
```

`<aura-router search="app">` задаёт default schema для routes без своего `search`.

---

## Ошибки и события

| Ситуация | Поведение |
|----------|-----------|
| Unknown schema name | `console.warn`, fallback raw query (dev); optional strict throw in test |
| Validate throws | `not-found` или navigation-error phase `search` |
| Redirect canonical | internal redirect до enter/load |

Optional event (Phase 1.1):

```ts
router.addEventListener('search-validated', (e) => {
  const { raw, query, schema } = e.detail;
});
```

---

## Примеры

### Zod + load

```html
<aura-route
  path="/products"
  search="products-filters"
  search-deps="page,sort,category"
  load="fetch-products"
></aura-route>
```

```ts
AuraRouter.useSearchSchema(defineSearchSchema({
  name: 'products-filters',
  schema: productsSearch,
}));

AuraRouter.use({
  name: 'fetch-products',
  version: '1.0.0',
  fn: async (ctx) => {
    const { page, sort, category } = ctx.to.query as z.infer<typeof productsSearch>;
    return fetchProducts({ page, sort, category });
  },
});
```

### Manual fn (без Zod)

```ts
AuraRouter.useSearchSchema(defineSearchSchema({
  name: 'products-filters',
  fn: (raw) => ({
    page: Math.max(1, Number(raw.page) || 1),
    sort: raw.sort === 'price' ? 'price' : 'name',
    category: raw.category?.slice(0, 64) ?? 'all',
  }),
  strict: true,
}));
```

### Navigate merge

```ts
// текущий URL: /products?page=1&sort=name
router.navigate('/products', { search: { page: 2 } });
// → /products?page=2&sort=name

router.navigate('/products', { search: { page: 2 }, replaceSearch: true });
// → /products?page=2
```

### После mutation + invalidate

```ts
await api.createProduct(data);
router.invalidate({ path: '/products' });
router.navigate('/products', { search: { page: 1 } });
```

---

## План реализации

### Phase 1 — core (P1)

| # | Task | Files |
|---|------|-------|
| 1.1 | `SearchSchemaRegistry` + `defineSearchSchema` | `core/search/*`, `hooks/` export |
| 1.2 | Attr `search`, `search-deps`, `search-strict` on `AuraRoute` / router | `aura-route.ts`, parsers |
| 1.3 | `SearchValidator` + wire in `resolveNavigationTarget` / matcher post-process | `match/resolve-navigation-target.ts` |
| 1.4 | `RouteInfo.query` typed as `unknown` values; add `rawQuery` | `route/types.ts`, lifecycle context |
| 1.5 | `buildRouteDataKey` + search-deps slice | `data-graph/route-data.ts` |
| 1.6 | `router.navigate(..., { search })` | `aura-router.ts`, `serialize-search.ts` |
| 1.7 | Tests: validate, deps key, navigate merge, inherit | `test/search/*` |

### Phase 1.1 — polish

| # | Task |
|---|------|
| 2.1 | Prefetch uses validated query |
| 2.2 | `search-validated` event |
| 2.3 | Demo story `/products?…` |
| 2.4 | README + HOOKS.md section |

### Phase 2 — DX (optional)

| # | Task |
|---|------|
| 3.1 | Codegen: scan `search="…"` → typed navigate helpers |
| 3.2 | `@aura-ui-web/router-zod` adapter package |
| 3.3 | SSR: validate search on server HTML render |

---

## Acceptance criteria (Phase 1 done)

- [ ] `?page=abc` с Zod schema → `{ page: 1 }` в `ctx.to.query`, load не падает
- [ ] `search-deps` excludes `utm` from DataGraph cache key
- [ ] `search-strict="true"` drops unknown keys from validated query
- [ ] Inherited `search` from `<aura-router>` applies to child without duplicate attr
- [ ] `navigate(path, { search })` merges correctly; `replaceSearch: true` replaces all
- [ ] Missing schema name → warn + raw query (backward compatible)
- [ ] Unit tests cover validator, deps, navigate serialization

---

## Open questions

1. **Merge vs replace search on child routes** — inherit parent search keys into child schema, или только leaf schema?  
   **Proposal v1:** только leaf schema; parent `search` = default name for children без своего attr.

2. **Typed `ctx.to.query`** — generic per schema или `Record<string, unknown>`?  
   **Proposal v1:** unknown + user cast; codegen later.

3. **Redirect canonical** — auto `replace` при coerce redirect или push?  
   **Proposal:** `replace: true` (не засорять history опечатками).

4. **Array query params** (`?tag=a&tag=b`) — v1 только string map; arrays Phase 2.

5. **Integration with reenter** — при same URL + changed invalid search treat as navigation?  
   **Proposal:** validate runs every match; if redirect → normal navigation.

---

## Сравнение с TanStack Router

| | TanStack | Aura (proposal) |
|---|----------|-----------------|
| Declare schema | TS `validateSearch` | HTML `search="name"` + registry |
| loaderDeps | TS function | HTML `search-deps="a,b"` |
| strict | `search.strict` | `search-strict` attr |
| navigate search | `{ search }` object | `{ search, replaceSearch? }` |
| Types | inferred | v1 manual; codegen later |

Parity **поведения** для filter/tab apps — да. Parity **DX для React** — нет (и не цель).

---

## Связанные документы

- [TANSTACK_ROUTER_COMPARISON.md](../comparison/TANSTACK_ROUTER_COMPARISON.md) — gap analysis
- [DATAGRAPH_GAPS.md](./DATAGRAPH_GAPS.md) — cache key / revalidate
- [NAVIGATION_MODEL.md](../NAVIGATION_MODEL.md) — match → pipeline

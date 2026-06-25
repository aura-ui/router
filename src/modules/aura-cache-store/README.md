# aura-cache-store

String-key in-memory cache for content and DOM snapshots. `Map` + doubly-linked list for O(1) lookup, LRU promotion, and removal.

```ts
import { AuraCacheStore, DEFAULT_GC_TIME } from './modules/aura-cache-store/core';
```

## Key concepts

### SWR (stale-while-revalidate)

A caching strategy: **return cached data immediately**, then **refresh it in the background** when it becomes outdated.

1. **Fresh** — data is up to date; serve from cache, no fetch.
2. **Stale** — data is outdated but still in cache; serve it now and revalidate in the background.
3. **Missing** — no cache entry; fetch and store.

Enable with `staleTime` (how long data stays fresh). Use `lookup()` to get the status and decide whether to revalidate.

### Invalidation

Manually mark cache entries as outdated or delete them — for example after a mutation, route change, or logout.

| Policy | What happens |
|--------|----------------|
| `'stale'` (default) | Entry stays readable; `lookup()` reports `stale` so you can revalidate |
| `'remove'` | Entry is deleted from cache immediately |

Methods: `invalidate(key)`, `invalidateMatch(predicate)`, `invalidateAll()`.

## Operating modes

| Mode | Options | Behavior |
|------|---------|----------|
| Unlimited | none | Entries never expire. `max` still limits size. |
| Simple GC | `gcTime` | Remove on access after TTL. No stale phase. |
| SWR | `staleTime` | Stale-while-revalidate: `fresh` → `stale` (still served) → removed after `gcTime`. Default `gcTime` is 5 min. |

`gcTime: Infinity` disables TTL removal — entries stay until LRU or explicit removal.

GC runs lazily on access (`get`, `has`, `lookup`, `isStale`) and proactively via `purgeExpired()` or background sweep. `peek`, `keys`, `isStale`, and `lookup` without `touch` do not promote LRU order. See [Read API](#read-api-has-vs-peek-vs-extract-vs-get) for `has` / `peek` / `extract`.

The diagram below shows the **SWR** lifecycle (`staleTime` set). In simple GC mode (`gcTime` only), entries skip the `stale` phase and go straight to `missing` once TTL elapses and the entry is accessed or swept.

```mermaid
stateDiagram-v2
  [*] --> missing
  missing --> fresh: set()
  fresh --> stale: age > staleTime\nor invalidate(stale)
  stale --> fresh: set()
  fresh --> missing: gcTime elapsed\nor invalidate(remove)\nor delete / clear / LRU
  stale --> missing: gcTime elapsed\nor invalidate(remove)\nor delete / clear / LRU
```

## Configuration

```ts
type CacheStoreOptions<T> = {
  max?: number;
  staleTime?: number;                  // SWR fresh window (ms)
  gcTime?: number;                     // max age since storedAt (ms)
  gcSweepInterval?: number | false;
  invalidatePolicy?: 'remove' | 'stale'; // default: 'stale'
  onRemove?: (key: string, value: T) => void;
};
```

| Option | Description |
|--------|-------------|
| `max` | LRU capacity; removes least recently used key first. Must be `>= 1` when set |
| `staleTime` | Enables SWR. Entries become stale after this age but stay readable |
| `gcTime` | Remove after max age since `storedAt`. Defaults to `DEFAULT_GC_TIME` (5 min) when `staleTime` is set. `Infinity` disables TTL |
| `invalidatePolicy` | Default for `invalidate`, `invalidateMatch`, `invalidateAll` |
| `onRemove` | Called on LRU/GC removal, `set` overwrite, `delete`, `clear`, `invalidate(..., 'remove')` |

### `gcSweepInterval`

- `undefined` — auto when `gcTime` is set: `clamp(gcTime / 2, 5s … 60s)`
- `number` — run `purgeExpired()` every N ms (no-op without `gcTime`)
- `false` — disabled; removal on access or manual `purgeExpired()` only

Background sweep lifecycle:

- **Start** — on the first `set()` while the store is non-empty
- **Stop** — when the store becomes empty (last entry removed) or on `clear()` / `destroy()`
- **Restart** — on the next `set()` after `clear()`

## API

| Method | LRU | Description |
|--------|:---:|-------------|
| `get(key)` | yes | Returns value (fresh or stale), or `undefined` if missing/GC-expired |
| `peek(key)` | no | Returns value without LRU promote; does not remove GC-expired entries |
| `lookup(key, touch?)` | if `touch` | `{ status: 'fresh' \| 'stale' \| 'missing', value? }` — removes GC-expired entries; use for SWR revalidate decisions |
| `set(key, value)` | yes | Resets stale flag and `storedAt`. Overwrite invokes `onRemove` for the previous value when it differs |
| `has(key)` | no | `true` if readable entry exists; removes GC-expired |
| `isStale(key)` | no | `true` if stale and readable; `false` if missing, fresh, or GC-expired |
| `invalidate(key, policy?)` | no | Mark outdated (`'stale'`) or delete (`'remove'`). Returns `false` if key missing. Default: `invalidatePolicy` |
| `invalidateMatch(predicate, policy?)` | no | Same as `invalidate`, for keys matching a filter |
| `invalidateAll(policy?)` | no | Same as `invalidate`, for every entry |
| `extract(key)` | — | Returns value and removes entry without `onRemove` (ownership transfer) |
| `delete(key)` | — | Remove one entry; invokes `onRemove` |
| `purgeExpired()` | — | Remove all GC-expired entries; returns count. No-op without `gcTime` |
| `clear()` / `destroy()` | — | Remove all entries and stop background sweep; `destroy()` is an alias for `clear()` |
| `keys()` | — | Snapshot of all keys (includes stale / not-yet-GC-removed; no LRU promote, no lazy GC) |
| `size` | — | Entry count (includes stale and not-yet-swept entries) |

### Read API: `has` vs `peek` vs `extract` vs `get`

Use this table to pick the right read path. **`RouteViewCache`** (`has` / `peek` / `extract`) follows the same rules via `AuraCacheStore`.

| Method | Returns value | Promotes LRU | Removes entry | Calls `onRemove` | GC-expired entry |
|--------|:-------------:|:------------:|:-------------:|:----------------:|------------------|
| `get` | yes | yes | no | on lazy GC only | removed on read → `undefined` |
| `has` | no (`boolean`) | no | no | on lazy GC only | removed on read → `false` |
| `peek` | yes | no | no | no | stays in store → `undefined` |
| `extract` | yes | no | yes | no | removed via `onRemove` → `undefined` |
| `delete` | no | — | yes | yes | — |

**When to use what**

- **`get`** — normal cache hit; stale values in SWR mode are still returned; promotes LRU.
- **`has`** — cheap existence check when promotion is unwanted; still triggers lazy GC (and `onRemove` on expired entries).
- **`peek`** — inspect without side effects: no LRU touch, no eviction, no `onRemove`. Prefer for devtools and “is it still there?” probes. Expired entries look missing but remain until `get` / `has` / `purgeExpired`.
- **`extract`** — take ownership (keep-alive checkout): value leaves the cache **without** `onRemove` so the caller can remount it. GC-expired entries are removed with `onRemove` and return `undefined`.

```ts
// keep-alive: detach → stash → take → reattach
const root = cache.extract(key); // ownership transfer, DOM not destroyed
cache.put(key, newRoot);         // overwrite calls onRemove on previous value

// probe without mutating LRU or destroying DOM
if (cache.peek(key)) { /* still stashed */ }
```

## Examples

### Basic usage

```ts
const cache = new AuraCacheStore<string>();

cache.set('/home', '<h1>Home</h1>');
cache.get('/home');   // '<h1>Home</h1>'
cache.has('/home');   // true
cache.delete('/home');
cache.get('/home');   // undefined
```

### TTL without SWR

```ts
const cache = new AuraCacheStore<string>({
  gcTime: 60_000,
  gcSweepInterval: false,
});

cache.set('fragment', '<nav>...</nav>');
// after 61s:
cache.get('fragment'); // undefined — removed on read
```

### SWR: stale-while-revalidate

Serve cached content immediately; when `lookup()` returns `stale`, show it and refresh in the background:

```ts
const cache = new AuraCacheStore<string>({
  staleTime: 30_000, // fresh for 30s; gcTime defaults to DEFAULT_GC_TIME (5 min)
});

async function loadPage(url: string): Promise<string> {
  const hit = cache.lookup(url);

  if (hit.status === 'fresh') return hit.value;

  if (hit.status === 'stale') {
    revalidate(url).catch(console.error);
    return hit.value;
  }

  const html = await fetch(url).then((r) => r.text());
  cache.set(url, html);
  return html;
}

async function revalidate(url: string): Promise<void> {
  cache.set(url, await fetch(url).then((r) => r.text()));
}
```

### LRU capacity

```ts
const cache = new AuraCacheStore<string>({ max: 2 });

cache.set('a', 'A');
cache.set('b', 'B');
cache.get('a');      // promote 'a'
cache.set('c', 'C'); // removes 'b' (LRU)

cache.has('b'); // false — has() does not promote LRU
```

Use `get` or `lookup(key, true)` when access should protect an entry from removal.

### Invalidation

Mark entries outdated after a mutation or event without deleting them immediately (default `'stale'` policy):

```ts
const cache = new AuraCacheStore<string>({ staleTime: 60_000 });

cache.set('data:users', '{"users":[]}');
cache.set('html:/about', '<main>About</main>');

// API data changed — mark stale, keep serving until revalidate
cache.invalidateMatch((key) => key.startsWith('data:'));
cache.isStale('data:users');  // true
cache.get('data:users');      // still returns JSON (stale)

// Or delete immediately
cache.invalidate('html:/about', 'remove');
cache.invalidateAll('remove');
```

### Proactive GC

```ts
const cache = new AuraCacheStore<string>({
  gcTime: 60_000,
  // gcSweepInterval omitted → auto sweep every 30s (gcTime / 2)
});

cache.set('temp', 'value');
// expired entries removed by background sweep even without reads

cache.purgeExpired(); // or trigger manually
cache.destroy();      // stop sweep and release all entries
```

### `onRemove` callback

Invoked when the store discards a value (LRU, GC, overwrite, `delete`, `clear`, `invalidate(..., 'remove')`). Use it to release resources — e.g. remove a DOM node from a detached keep-alive subtree.

**Do not call store methods inside `onRemove`.** While the callback runs, the store may be walking its internal list or updating an entry. Calling `set`, `delete`, `clear`, `get`, `extract`, or `invalidate` from `onRemove` is unsupported: it can double-invoke callbacks, skip entries, or recurse indefinitely. Only clean up the `value` you receive.

```ts
const cache = new AuraCacheStore<HTMLElement>({
  max: 10,
  onRemove: (_key, el) => el.remove(), // OK — release the element
});

// ❌ unsupported
const bad = new AuraCacheStore<HTMLElement>({
  onRemove: (key) => cache.delete(key),
});
```

`extract` intentionally does **not** call `onRemove` — ownership moves to the caller (keep-alive checkout).

## Exported types

```ts
export const DEFAULT_GC_TIME = 5 * 60_000;

type InvalidatePolicy = 'remove' | 'stale';
type CacheEntryStatus = 'fresh' | 'stale' | 'missing';

type CacheLookup<T> =
  | { status: 'missing' }
  | { status: 'fresh'; value: T }
  | { status: 'stale'; value: T };
```

## Tests

```bash
npx jest src/modules/aura-cache-store/test/aura-cache-store.test.ts
```

## Benchmark

```bash
npm run bench:cache
npm run bench:cache:gc   # with --expose-gc
```

## Comparison with SPA router caches

See [docs/comparison/CACHE_STORE_COMPARISON.md](../../docs/comparison/CACHE_STORE_COMPARISON.md) — SWR/LRU parity with TanStack Router, ratings (7/10 as engine), benchmark numbers, roadmap to router integration.

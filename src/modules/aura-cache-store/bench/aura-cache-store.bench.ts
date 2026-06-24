/**
 * Benchmark: Map-order LRU vs DLL LRU (AuraCacheStore).
 *
 * Practices aligned with Redis/memtier (mixed ratios, Zipfian), Caffeine
 * (correctness + throughput), and JMH-style warmup / multi-run stats.
 *
 * Run:
 *   npm run bench:cache
 *   npm run bench:cache:gc   (optional: GC between runs)
 */

import { AuraCacheStore } from '../core/aura-cache-store';

type CacheLike = {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
};

/** Map + delete/set reorder on every get (first version). */
class MapCacheStoreV1 implements CacheLike {
  private readonly max?: number;
  private readonly entries = new Map<string, { value: string; storedAt: number }>();

  constructor(max?: number) {
    this.max = max;
  }

  get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (this.max !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }

    return entry.value;
  }

  set(key: string, value: string): void {
    const existing = this.entries.get(key);
    if (existing) this.entries.delete(key);

    this.entries.set(key, { value, storedAt: Date.now() });
    this.trim();
  }

  private trim(): void {
    const max = this.max;
    if (max === undefined || this.entries.size <= max) return;

    while (this.entries.size > max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** Map + trim only on insert (second version). */
class MapCacheStoreV2 implements CacheLike {
  private readonly max?: number;
  private readonly entries = new Map<string, { value: string; storedAt: number }>();

  constructor(max?: number) {
    this.max = max;
  }

  get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (this.max !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }

    return entry.value;
  }

  set(key: string, value: string): void {
    const now = Date.now();
    const newEntry = { value, storedAt: now };
    const existing = this.entries.get(key);

    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, newEntry);
      return;
    }

    this.entries.set(key, newEntry);
    this.trim();
  }

  private trim(): void {
    const max = this.max;
    if (max === undefined || this.entries.size <= max) return;

    while (this.entries.size > max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

const OPS = 100_000;
const WARMUP = 10_000;
const RUNS = 7;
const MAX = 100;

/** Prevents V8 from eliminating dead results (JMH blackhole analogue). */
let sink = 0;

function consume(value: string | undefined): void {
  sink ^= value?.length ?? 0;
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function stddev(samples: number[], avg: number): number {
  const variance = samples.reduce((sum, x) => sum + (x - avg) ** 2, 0) / samples.length;
  return Math.sqrt(variance);
}

function maybeGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
}

type BenchResult = { name: string; medianOps: number; avgOps: number; cvPct: number; samples: number[] };

function bench(name: string, fn: (i: number) => void, ops = OPS): BenchResult {
  for (let i = 0; i < WARMUP; i++) fn(i);

  const samples: number[] = [];

  for (let run = 0; run < RUNS; run++) {
    maybeGc();
    const start = performance.now();
    for (let i = 0; i < ops; i++) fn(i);
    const ms = performance.now() - start;
    samples.push(Math.round((ops / ms) * 1000));
  }

  const avgOps = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const med = Math.round(median(samples));
  const cvPct = Math.round((stddev(samples, avgOps) / avgOps) * 1000) / 10;

  return { name, medianOps: med, avgOps, cvPct, samples };
}

function fill(cache: CacheLike, count: number, prefix = 'route:'): void {
  for (let i = 0; i < count; i++) {
    cache.set(`${prefix}${i}`, `payload-${i}`);
  }
}

/** Zipfian key index: skewed access like real router traffic (memtier / ARC style). */
function zipfIndex(i: number, n: number, skew = 0.8): number {
  const u = ((i * 2654435761) >>> 0) / 0x1_0000_0000;
  return Math.min(n - 1, Math.floor(n * u ** skew));
}

function precomputeKeys(count: number, selector: (i: number) => number, prefix = 'route:'): string[] {
  const keys = new Array<string>(count);
  for (let i = 0; i < count; i++) {
    keys[i] = `${prefix}${selector(i)}`;
  }
  return keys;
}

// --- Correctness checks (run once, not timed) ---

type CorrectnessCheck = { label: string; run: () => void | Promise<void> };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const correctnessChecks: CorrectnessCheck[] = [
  {
    label: 'LRU: promoted key survives eviction',
    run: () => {
      const cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.get('a');
      cache.set('c', 'C');
      if (cache.has('b')) throw new Error('expected b evicted');
      if (!cache.has('a') || !cache.has('c')) throw new Error('expected a,c present');
    },
  },
  {
    label: 'LRU: has() does not promote',
    run: () => {
      const cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.has('a');
      cache.set('c', 'C');
      if (cache.has('a')) throw new Error('expected a evicted after has() without promotion');
    },
  },
  {
    label: 'SWR: lookup reports fresh → stale → missing',
    run: async () => {
      const cache = new AuraCacheStore<string>({
        staleTime: 50,
        gcTime: 200,
        gcSweepInterval: false,
      });
      cache.set('x', 'v');
      if (cache.lookup('x').status !== 'fresh') throw new Error('expected fresh');

      await sleep(60);
      if (cache.lookup('x').status !== 'stale') throw new Error('expected stale');

      await sleep(160);
      if (cache.lookup('x').status !== 'missing') throw new Error('expected missing after gcTime');
    },
  },
  {
    label: 'invalidateMatch: stale policy keeps readable values',
    run: () => {
      const cache = new AuraCacheStore<string>({ staleTime: 60_000, gcSweepInterval: false });
      cache.set('data:a', 'A');
      cache.set('html:b', 'B');
      cache.invalidateMatch((k) => k.startsWith('data:'));
      if (!cache.isStale('data:a') || cache.isStale('html:b')) throw new Error('stale flags wrong');
      if (cache.get('data:a') !== 'A') throw new Error('stale entry must remain readable');
    },
  },
  {
    label: 'Map v1/v2 agree with DLL on round-robin LRU order',
    run: () => {
      const factories: Array<() => CacheLike> = [
        () => new MapCacheStoreV1(3),
        () => new MapCacheStoreV2(3),
        () => new AuraCacheStore<string>({ max: 3, gcSweepInterval: false }),
      ];

      for (const create of factories) {
        const cache = create();
        fill(cache, 3);
        for (let i = 0; i < 3; i++) cache.get(`route:${i}`);
        cache.set('route:99', 'new');
        if (cache.get('route:0') !== undefined) throw new Error('route:0 should be evicted');
        if (cache.get('route:1') === undefined || cache.get('route:2') === undefined) {
          throw new Error('route:1,2 should survive');
        }
      }
    },
  },
];

async function runCorrectnessChecks(): Promise<void> {
  console.log('=== Correctness (invariant checks) ===');
  let passed = 0;

  for (const { label, run } of correctnessChecks) {
    try {
      await run();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${label}: ${msg}`);
    }
  }

  console.log(`  ${passed}/${correctnessChecks.length} passed\n`);
  if (passed !== correctnessChecks.length) {
    console.warn('  Warning: correctness failures — benchmark numbers may be misleading.\n');
  }
}

// --- Scenario runner ---

type ScenarioFactory = [string, () => CacheLike];

function runScenario(
  label: string,
  factories: ScenarioFactory[],
  setup: (cache: CacheLike) => void,
  run: (cache: CacheLike, i: number) => void,
  ops = OPS,
): void {
  console.log(`\n=== ${label} (${ops.toLocaleString()} ops × ${RUNS} runs, median ops/s) ===`);

  const totals = factories.map(([name, create]) => {
    const samples: number[] = [];

    for (let r = 0; r < RUNS; r++) {
      const cache = create();
      setup(cache);
      const { medianOps, samples: runSamples } = bench(name, (i) => run(cache, i), ops);
      samples.push(medianOps);
      void runSamples;
    }

    const med = Math.round(median(samples));
    const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    const cvPct = Math.round((stddev(samples, avg) / avg) * 1000) / 10;
    return { name, med, cvPct, samples };
  });

  const best = Math.max(...totals.map((t) => t.med));

  for (const { name, med, cvPct, samples } of totals) {
    const ratio = (med / best).toFixed(2);
    const spread = `${Math.min(...samples).toLocaleString()}–${Math.max(...samples).toLocaleString()}`;
    console.log(
      `  ${name.padEnd(32)} ${med.toLocaleString().padStart(12)} ops/s  (${ratio}x)  CV ${cvPct}%  [${spread}]`,
    );
  }
}

const lruFactories: ScenarioFactory[] = [
  ['Map v1 (reorder+trim)', () => new MapCacheStoreV1(MAX)],
  ['Map v2 (reorder, trim insert)', () => new MapCacheStoreV2(MAX)],
  ['DLL AuraCacheStore', () => new AuraCacheStore<string>({ max: MAX, gcSweepInterval: false })],
];

// --- Main ---

async function main(): Promise<void> {
console.log('Cache store benchmark');
console.log(`Node ${process.version}`);
if (!(globalThis as { gc?: () => void }).gc) {
  console.log('Tip: run with --expose-gc for stabler runs (GC between iterations)');
}

await runCorrectnessChecks();

const hotKey = precomputeKeys(OPS, () => MAX - 1)[0]!;

runScenario('get hot key (MRU hit)', lruFactories, (cache) => fill(cache, MAX), (cache, i) => {
  consume(cache.get(hotKey));
  void i;
});

runScenario('get miss (cold key)', lruFactories, (cache) => fill(cache, MAX), (cache, i) => {
  consume(cache.get(`missing:${i}`));
});

const roundRobinKeys = precomputeKeys(OPS, (i) => i % MAX);

runScenario('get round-robin (LRU churn)', lruFactories, (cache) => fill(cache, MAX), (cache, i) => {
  consume(cache.get(roundRobinKeys[i]!));
});

const zipfKeys = precomputeKeys(OPS, (i) => zipfIndex(i, MAX));

runScenario('get Zipfian skew (80/20-ish)', lruFactories, (cache) => fill(cache, MAX), (cache, i) => {
  consume(cache.get(zipfKeys[i]!));
});

runScenario('set update same key', lruFactories, (cache) => cache.set('route:hot', 'v0'), (cache, i) => {
  cache.set('route:hot', `v${i}`);
});

runScenario('set insert + evict', lruFactories, () => {}, (cache, i) => {
  cache.set(`route:${i}`, `payload-${i}`);
});

runScenario(
  'router-like mix (80% hot, 15% cold get, 5% set)',
  lruFactories,
  (cache) => fill(cache, MAX / 2),
  (cache, i) => {
    const roll = i % 100;
    if (roll < 80) consume(cache.get('route:49'));
    else if (roll < 95) consume(cache.get(roundRobinKeys[i % (MAX / 2)]!));
    else cache.set('route:49', `v${i}`);
  },
);

// AuraCacheStore-specific API paths (no Map baselines — different surface)
const auraOnly: ScenarioFactory[] = [
  ['lookup fresh (no touch)', () => new AuraCacheStore<string>({ staleTime: 60_000, gcSweepInterval: false })],
  ['lookup + touch', () => new AuraCacheStore<string>({ staleTime: 60_000, gcSweepInterval: false })],
  ['has() probe', () => new AuraCacheStore<string>({ max: MAX, gcSweepInterval: false })],
  ['purgeExpired sweep', () => new AuraCacheStore<string>({ gcTime: 1, gcSweepInterval: false })],
];

runScenario(
  'lookup fresh (no touch)',
  [auraOnly[0]!],
  (cache) => fill(cache, MAX),
  (cache, i) => {
    const hit = (cache as AuraCacheStore<string>).lookup(roundRobinKeys[i]!);
    if (hit.status !== 'missing') consume(hit.value);
  },
);

runScenario(
  'lookup + touch (LRU promote)',
  [auraOnly[1]!],
  (cache) => fill(cache, MAX),
  (cache, i) => {
    const hit = (cache as AuraCacheStore<string>).lookup(roundRobinKeys[i]!, true);
    if (hit.status !== 'missing') consume(hit.value);
  },
);

runScenario(
  'has() probe (no LRU promote)',
  [auraOnly[2]!],
  (cache) => fill(cache, MAX),
  (cache, i) => {
    sink ^= (cache as AuraCacheStore<string>).has(roundRobinKeys[i]!) ? 1 : 0;
  },
);

runScenario(
  'purgeExpired on full cache',
  [auraOnly[3]!],
  (cache) => fill(cache, MAX),
  (cache) => {
    (cache as AuraCacheStore<string>).purgeExpired();
  },
  10_000,
);

runScenario(
  'invalidateMatch stale (prefix scan)',
  [['AuraCacheStore', () => new AuraCacheStore<string>({ staleTime: 60_000, gcSweepInterval: false })]],
  (cache) => {
    for (let i = 0; i < MAX; i++) {
      cache.set(`data:${i}`, `d${i}`);
      cache.set(`html:${i}`, `h${i}`);
    }
  },
  (cache, i) => {
    if (i % 50 === 0) {
      (cache as AuraCacheStore<string>).invalidateMatch((k) => k.startsWith('data:'));
    } else {
      consume(cache.get(`html:${i % MAX}`));
    }
  },
  20_000,
);

// Scale: how does LRU churn degrade with capacity?
console.log('\n=== Scale: round-robin get vs max size (median ops/s) ===');
for (const max of [10, 100, 1_000]) {
  const keys = precomputeKeys(OPS, (i) => i % max);
  const scaleFactories: ScenarioFactory[] = [
    ['Map v1', () => new MapCacheStoreV1(max)],
    ['Map v2', () => new MapCacheStoreV2(max)],
    ['AuraCacheStore', () => new AuraCacheStore<string>({ max, gcSweepInterval: false })],
  ];

  console.log(`  max=${max}`);
  for (const [name, create] of scaleFactories) {
    const cache = create();
    fill(cache, max);
    const { medianOps, cvPct } = bench(name, (i) => consume(cache.get(keys[i]!)));
    console.log(`    ${name.padEnd(16)} ${medianOps.toLocaleString().padStart(12)} ops/s  CV ${cvPct}%`);
  }
}

// Context: cache vs network
const dll = new AuraCacheStore<string>({ max: MAX, gcSweepInterval: false });
fill(dll, MAX);
const cacheMs = performance.now();
for (let i = 0; i < OPS; i++) consume(dll.get(hotKey));
const cacheOnlyMs = performance.now() - cacheMs;

const msPerHotGet = cacheOnlyMs / OPS;

console.log('\n=== Context ===');
console.log(`  sink (anti-DCE): ${sink}`);
console.log(`  1 hot get (DLL): ~${(msPerHotGet * 1000).toFixed(2)} µs`);
console.log(`  100k hot gets (DLL): ~${cacheOnlyMs.toFixed(1)} ms`);
console.log(`  1 fetch partial: ~50–300 ms (network)`);
console.log(
  `  1 fetch ≈ ${Math.round(50 / msPerHotGet).toLocaleString()}–${Math.round(300 / msPerHotGet).toLocaleString()} hot cache gets`,
);
}

main();

/**
 * Benchmark: Map-order LRU vs DLL LRU (AuraCacheStore).
 * Run: npx tsx src/modules/aura-cache-store/bench/aura-cache-store.bench.ts
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
const WARMUP = 5_000;
const RUNS = 5;

function bench(name: string, fn: (i: number) => void, ops = OPS): { name: string; opsPerSec: number } {
  for (let i = 0; i < WARMUP; i++) fn(i);

  const start = performance.now();
  for (let i = 0; i < ops; i++) fn(i);
  const ms = performance.now() - start;

  return { name, opsPerSec: Math.round((ops / ms) * 1000) };
}

function runScenario(
  label: string,
  setup: (cache: CacheLike) => void,
  run: (cache: CacheLike, i: number) => void,
): void {
  const factories: Array<[string, () => CacheLike]> = [
    ['Map v1 (reorder+trim)', () => new MapCacheStoreV1(100)],
    ['Map v2 (reorder, trim insert)', () => new MapCacheStoreV2(100)],
    ['DLL AuraCacheStore', () => new AuraCacheStore<string>({ max: 100 })],
  ];

  console.log(`\n=== ${label} (${OPS.toLocaleString()} ops × ${RUNS} runs) ===`);

  const totals = factories.map(([name, create]) => {
    const samples: number[] = [];

    for (let r = 0; r < RUNS; r++) {
      const cache = create();
      setup(cache);
      const { opsPerSec } = bench(name, (i) => run(cache, i), OPS);
      samples.push(opsPerSec);
    }

    const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    return { name, avg, samples };
  });

  const best = Math.max(...totals.map((t) => t.avg));

  for (const { name, avg, samples } of totals) {
    const ratio = (avg / best).toFixed(2);
    const spread = `${Math.min(...samples).toLocaleString()}–${Math.max(...samples).toLocaleString()}`;
    console.log(`  ${name.padEnd(32)} ${avg.toLocaleString().padStart(12)} ops/s  (${ratio}x)  [${spread}]`);
  }
}

function fill(cache: CacheLike, count: number): void {
  for (let i = 0; i < count; i++) {
    cache.set(`route:${i}`, `payload-${i}`);
  }
}

console.log('Cache store benchmark');
console.log(`Node ${process.version}`);

runScenario('get hot key (MRU hit)', (cache) => fill(cache, 100), (cache) => {
  cache.get('route:99');
});

runScenario('get round-robin (LRU churn)', (cache) => fill(cache, 100), (cache, i) => {
  cache.get(`route:${i % 100}`);
});

runScenario('set update same key', (cache) => {
  cache.set('route:hot', 'v0');
}, (cache, i) => {
  cache.set('route:hot', `v${i}`);
});

runScenario('set insert + evict (max=100)', () => {}, (cache, i) => {
  cache.set(`route:${i}`, `payload-${i}`);
});

runScenario('router-like mix (80% hot get, 15% cold get, 5% set)', (cache) => fill(cache, 50), (cache, i) => {
  const roll = i % 100;
  if (roll < 80) cache.get('route:49');
  else if (roll < 95) cache.get(`route:${i % 50}`);
  else cache.set('route:49', `v${i}`);
});

// Rough "navigation" context: how long is 100k cache ops vs one fetch?
const dll = new AuraCacheStore<string>({ max: 100 });
fill(dll, 100);
const cacheMs = performance.now();
for (let i = 0; i < OPS; i++) dll.get('route:99');
const cacheOnlyMs = performance.now() - cacheMs;

const msPerHotGet = cacheOnlyMs / OPS;

console.log('\n=== Context ===');
console.log(`  1 hot get (DLL): ~${(msPerHotGet * 1000).toFixed(2)} µs`);
console.log(`  100k hot gets (DLL): ~${cacheOnlyMs.toFixed(1)} ms`);
console.log(`  1 fetch partial: ~50–300 ms (network)`);
console.log(
  `  1 fetch ≈ ${Math.round(50 / msPerHotGet).toLocaleString()}–${Math.round(300 / msPerHotGet).toLocaleString()} hot cache gets`,
);

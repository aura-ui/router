/**
 * Shared benchmark utilities (JMH-style warmup, multi-run median, anti-DCE sink).
 */
export type BenchResult = {
  name: string;
  medianOps: number;
  avgOps: number;
  cvPct: number;
  samples: number[];
  totalMs?: number;
};
/** Prevents V8 from eliminating dead results. */
let sink = 0;
export function consume(value: unknown): void {
  if (value === null || value === undefined) {
    sink ^= 0;
    return;
  }
  if (typeof value === 'number') {
    sink ^= value;
    return;
  }
  if (typeof value === 'boolean') {
    sink ^= value ? 1 : 0;
    return;
  }
  if (typeof value === 'string') {
    sink ^= value.length;
    return;
  }
  if (typeof value === 'object') {
    sink ^= Object.keys(value).length;
  }
}
export function getSink(): number {
  return sink;
}
export function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
export function stddev(samples: number[], avg: number): number {
  const variance = samples.reduce((sum, x) => sum + (x - avg) ** 2, 0) / samples.length;
  return Math.sqrt(variance);
}
export function maybeGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
}
export type BenchOptions = {
  ops?: number;
  warmup?: number;
  runs?: number;
  /** Report median latency µs/op instead of ops/s */
  reportLatency?: boolean;
};
const DEFAULT_OPS = 10_000;
const DEFAULT_WARMUP = 1_000;
const DEFAULT_RUNS = 7;
export { DEFAULT_OPS, DEFAULT_RUNS };
export function bench(
  name: string,
  fn: (i: number) => void,
  options: BenchOptions = {},
): BenchResult {
  const ops = options.ops ?? DEFAULT_OPS;
  const warmup = options.warmup ?? DEFAULT_WARMUP;
  const runs = options.runs ?? DEFAULT_RUNS;
  for (let i = 0; i < warmup; i++) fn(i);
  const samples: number[] = [];
  let totalMs = 0;
  for (let run = 0; run < runs; run++) {
    maybeGc();
    const start = performance.now();
    for (let i = 0; i < ops; i++) fn(i);
    const ms = performance.now() - start;
    totalMs += ms;
    samples.push(Math.round((ops / ms) * 1000));
  }
  const avgOps = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const med = Math.round(median(samples));
  const cvPct = Math.round((stddev(samples, avgOps) / avgOps) * 1000) / 10;
  return {
    name,
    medianOps: options.reportLatency ? med : med,
    avgOps,
    cvPct,
    samples,
    totalMs: totalMs / runs,
  };
}
export async function benchAsync(
  name: string,
  fn: (i: number) => Promise<void>,
  options: BenchOptions = {},
): Promise<BenchResult> {
  const ops = options.ops ?? 1_000;
  const warmup = options.warmup ?? 100;
  const runs = options.runs ?? 5;
  for (let i = 0; i < warmup; i++) await fn(i);
  const samples: number[] = [];
  let totalMs = 0;
  for (let run = 0; run < runs; run++) {
    maybeGc();
    const start = performance.now();
    for (let i = 0; i < ops; i++) await fn(i);
    const ms = performance.now() - start;
    totalMs += ms;
    samples.push(Math.round((ops / ms) * 1000));
  }
  const avgOps = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const med = Math.round(median(samples));
  const cvPct = Math.round((stddev(samples, avgOps) / avgOps) * 1000) / 10;
  return { name, medianOps: med, avgOps, cvPct, samples, totalMs: totalMs / runs };
}
export function printScenarioHeader(label: string, ops: number, runs: number): void {
  console.log(`\n=== ${label} (${ops.toLocaleString()} ops × ${runs} runs, median ops/s) ===`);
}
export function printResultRow(
  result: BenchResult,
  bestOps: number,
  extra?: string,
): void {
  const ratio = bestOps > 0 ? (result.medianOps / bestOps).toFixed(2) : '1.00';
  const spread = `${Math.min(...result.samples).toLocaleString()}–${Math.max(...result.samples).toLocaleString()}`;
  const suffix = extra ? `  ${extra}` : '';
  console.log(
    `  ${result.name.padEnd(36)} ${result.medianOps.toLocaleString().padStart(12)} ops/s  (${ratio}x)  CV ${result.cvPct}%  [${spread}]${suffix}`,
  );
}
export function runScenario(
  label: string,
  cases: Array<{ name: string; fn: (i: number) => void }>,
  options: BenchOptions = {},
): BenchResult[] {
  const ops = options.ops ?? DEFAULT_OPS;
  const runs = options.runs ?? DEFAULT_RUNS;
  printScenarioHeader(label, ops, runs);
  const results = cases.map(({ name, fn }) => bench(name, fn, options));
  const best = Math.max(...results.map((r) => r.medianOps));
  for (const result of results) {
    printResultRow(result, best);
  }
  return results;
}

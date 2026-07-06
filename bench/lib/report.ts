/**
 * Benchmark session: console output + markdown report per scenario.
 *
 * Reports: bench/reports/<id>/<timestamp>.md (append-only history) + latest.md (overwrite shortcut).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  bench,
  benchAsync,
  DEFAULT_OPS,
  DEFAULT_RUNS,
  getSink,
  type BenchOptions,
  type BenchResult,
} from './stats';
export type BenchMeta = {
  /** Folder name under bench/reports/ */
  id: string;
  title: string;
  auditRef?: string;
  npmScript?: string;
};
export type RecordedRow = {
  name: string;
  medianOps: number;
  avgOps: number;
  cvPct: number;
  samples: number[];
  ratio: string;
  note?: string;
};
export type RecordedScenario = {
  label: string;
  ops: number;
  runs: number;
  rows: RecordedRow[];
};
export type SavedReport = {
  dir: string;
  timestampFile: string;
  latestFile: string;
};
export class BenchSession {
  readonly startedAt = new Date();
  private finishedAt?: Date;
  private readonly scenarios: RecordedScenario[] = [];
  private current: RecordedScenario | null = null;
  constructor(readonly meta: BenchMeta) {}
  header(): void {
    this.log(this.meta.title);
    this.log(`Node ${process.version}`);
    if (this.meta.auditRef) this.log(this.meta.auditRef);
    if (this.meta.npmScript) this.log(`Run: ${this.meta.npmScript}`);
    this.log('');
  }
  log(line = ''): void {
    console.log(line);
  }
  beginScenario(label: string, ops: number, runs: number): void {
    this.log(`\n=== ${label} (${ops.toLocaleString()} ops × ${runs} runs, median ops/s) ===`);
    this.current = { label, ops, runs, rows: [] };
  }
  recordResult(result: BenchResult, bestOps: number, note?: string): void {
    const ratio = bestOps > 0 ? (result.medianOps / bestOps).toFixed(2) : '1.00';
    const spread = `${Math.min(...result.samples).toLocaleString()}–${Math.max(...result.samples).toLocaleString()}`;
    const suffix = note ? `  ${note}` : '';
    this.log(
      `  ${result.name.padEnd(36)} ${result.medianOps.toLocaleString().padStart(12)} ops/s  (${ratio}x)  CV ${result.cvPct}%  [${spread}]${suffix}`,
    );
    this.current?.rows.push({
      name: result.name,
      medianOps: result.medianOps,
      avgOps: result.avgOps,
      cvPct: result.cvPct,
      samples: [...result.samples],
      ratio,
      note,
    });
  }
  endScenario(): void {
    if (this.current) {
      this.scenarios.push(this.current);
      this.current = null;
    }
  }
  runScenario(
    label: string,
    cases: Array<{ name: string; fn: (i: number) => void }>,
    options: BenchOptions = {},
  ): BenchResult[] {
    const ops = options.ops ?? DEFAULT_OPS;
    const runs = options.runs ?? DEFAULT_RUNS;
    this.beginScenario(label, ops, runs);
    const results = cases.map(({ name, fn }) => bench(name, fn, options));
    const best = Math.max(...results.map((r) => r.medianOps), 0);
    for (const result of results) {
      this.recordResult(result, best);
    }
    this.endScenario();
    return results;
  }
  async runScenarioAsync(
    label: string,
    cases: Array<{ name: string; fn: (i: number) => Promise<void>; note?: string }>,
    options: BenchOptions = {},
  ): Promise<BenchResult[]> {
    const ops = options.ops ?? 1_000;
    const runs = options.runs ?? 5;
    this.beginScenario(label, ops, runs);
    const results: BenchResult[] = [];
    for (const { name, fn, note } of cases) {
      const result = await benchAsync(name, fn, options);
      results.push(result);
      const best = Math.max(...results.map((r) => r.medianOps), result.medianOps);
      this.recordResult(result, best, note);
    }
    this.endScenario();
    return results;
  }
  footer(): void {
    this.log(`\n  sink: ${getSink()}`);
    this.finishedAt = new Date();
  }
  save(): SavedReport {
    if (!this.finishedAt) this.finishedAt = new Date();
    const benchRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const reportDir = path.join(benchRoot, 'reports', this.meta.id);
    fs.mkdirSync(reportDir, { recursive: true });
    const md = this.renderMarkdown();
    const timestampFile = resolveUniqueReportPath(reportDir, this.startedAt);
    const latestFile = path.join(reportDir, 'latest.md');
    fs.writeFileSync(timestampFile, md, 'utf8');
    fs.writeFileSync(latestFile, md, 'utf8');
    this.log(`\n  Report saved:`);
    this.log(`    ${path.relative(process.cwd(), timestampFile)} (archived)`);
    this.log(`    ${path.relative(process.cwd(), latestFile)} (latest — overwritten each run)`);
    return { dir: reportDir, timestampFile, latestFile };
  }
  private renderMarkdown(): string {
    const finished = this.finishedAt ?? new Date();
    const durationMs = finished.getTime() - this.startedAt.getTime();
    const gcAvailable = Boolean((globalThis as { gc?: () => void }).gc);
    const lines: string[] = [
      `# ${this.meta.title}`,
      '',
      '| | |',
      '|---|---|',
      `| **Scenario ID** | \`${this.meta.id}\` |`,
      `| **Started** | ${this.startedAt.toISOString()} |`,
      `| **Finished** | ${finished.toISOString()} |`,
      `| **Duration** | ${durationMs} ms |`,
      `| **Node** | ${process.version} |`,
      `| **GC between runs** | ${gcAvailable ? 'yes (`--expose-gc`)' : 'no — use `npm run bench:gc`'} |`,
    ];
    if (this.meta.auditRef) {
      lines.push(`| **Audit** | ${this.meta.auditRef} |`);
    }
    if (this.meta.npmScript) {
      lines.push(`| **Command** | \`${this.meta.npmScript}\` |`);
    }
    lines.push('', '---', '');
    for (const scenario of this.scenarios) {
      lines.push(`## ${scenario.label}`);
      lines.push('');
      lines.push(`Ops per run: **${scenario.ops.toLocaleString()}** · Runs: **${scenario.runs}**`);
      lines.push('');
      lines.push('| Case | Median ops/s | Avg ops/s | CV % | Spread | Ratio | Note |');
      lines.push('|------|-------------:|----------:|-----:|--------|------:|------|');
      for (const row of scenario.rows) {
        const spread = `${Math.min(...row.samples).toLocaleString()}–${Math.max(...row.samples).toLocaleString()}`;
        lines.push(
          `| ${row.name} | ${row.medianOps.toLocaleString()} | ${row.avgOps.toLocaleString()} | ${row.cvPct} | ${spread} | ${row.ratio} | ${row.note ?? ''} |`,
        );
      }
      lines.push('');
    }
    lines.push('---', '', `**sink (anti-DCE):** ${getSink()}`, '');
    lines.push(
      '> Generated by aura-ui-router bench. Compare runs on the same machine before/after optimizations.',
    );
    lines.push('');
    return lines.join('\n');
  }
}
/** Filename-safe ISO timestamp with milliseconds, e.g. `2026-07-06T21-30-00-123Z`. */
export function formatReportTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\./g, '-');
}
/** Unique path: never overwrites an existing archived report. */
export function resolveUniqueReportPath(reportDir: string, startedAt: Date): string {
  const base = formatReportTimestamp(startedAt);
  let candidate = path.join(reportDir, `${base}.md`);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(reportDir, `${base}-${suffix}.md`);
    suffix++;
  }
  return candidate;
}
export function isBenchMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return moduleUrl === pathToFileURL(path.resolve(entry)).href;
}

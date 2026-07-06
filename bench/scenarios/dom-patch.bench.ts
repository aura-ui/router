/**
 * Bench: DOM patch — replaceInner / innerHTML parse cost.
 * Maps to NAVIGATION_PERF_AUDIT §3.
 *
 * Run: npm run bench:dom-patch
 */
import { replaceInner, updateInner } from '../../src/modules/aura-dom/core/patch';
import { htmlPayload } from '../lib/fixtures';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
const BENCH_ID = 'dom-patch';
async function setupJsdom(): Promise<boolean> {
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="outlet"></div></body></html>');
    const g = globalThis as typeof globalThis & {
      window?: Window;
      document?: Document;
      HTMLElement?: typeof HTMLElement;
    };
    g.window = dom.window as unknown as Window;
    g.document = dom.window.document;
    g.HTMLElement = dom.window.HTMLElement;
    return true;
  } catch {
    return false;
  }
}
export async function runDomPatchBench(): Promise<SavedReport | null> {
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'DOM patch benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT §3 innerHTML replace',
    npmScript: 'npm run bench:dom-patch',
  });
  session.header();
  const ok = await setupJsdom();
  if (!ok) {
    session.log('  ✗ jsdom not found — install via jest-environment-jsdom or add jsdom devDependency');
    session.footer();
    session.save();
    process.exitCode = 1;
    return null;
  }
  const outlet = document.getElementById('outlet')!;
  const sizes = [1, 10, 50] as const;
  for (const kb of sizes) {
    const html = htmlPayload(kb);
    session.runScenario(
      `replaceInner (~${kb} KB html)`,
      [
        { name: 'replaceInner', fn: () => { replaceInner(outlet, html); } },
        { name: 'updateInner (v1 replace)', fn: () => { updateInner(outlet, html); } },
      ],
      { ops: kb >= 50 ? 200 : kb >= 10 ? 1_000 : 3_000 },
    );
  }
  session.footer();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runDomPatchBench();
}
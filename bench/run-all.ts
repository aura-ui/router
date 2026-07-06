/**
 * Run all navigation performance benchmarks.
 *
 * Run:
 *   npm run bench
 *   npm run bench:gc        (stabler runs with --expose-gc)
 */
import { setupMinimalWindow } from './lib/env';
import { runUrlMatcherBench } from './scenarios/url-matcher.bench';
import { runMatchedChainBench } from './scenarios/matched-chain.bench';
import { runTransitionPlanBench } from './scenarios/transition-plan.bench';
import { runPrefetchPlanBench } from './scenarios/prefetch-plan.bench';
import { runDomPatchBench } from './scenarios/dom-patch.bench';
import { runRouteTreeBench } from './scenarios/route-tree.bench';
import { runNavigationPipelineBench } from './scenarios/navigation-pipeline.bench';
import { runDataGraphBench } from './scenarios/data-graph.bench';
async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' aura-ui-router navigation benchmarks');
  console.log(` Node ${process.version}`);
  if (!(globalThis as { gc?: () => void }).gc) {
    console.log(' Tip: npm run bench:gc for GC between iterations');
  }
  console.log(' Doc: docs/todo/NAVIGATION_PERF_AUDIT.md');
  console.log(' Reports: bench/reports/<scenario>/');
  console.log('═══════════════════════════════════════════════════════\n');
  setupMinimalWindow();
  const saved: string[] = [];
  saved.push(runUrlMatcherBench().timestampFile);
  saved.push(runMatchedChainBench().timestampFile);
  saved.push(runTransitionPlanBench().timestampFile);
  saved.push(runPrefetchPlanBench().timestampFile);
  const domReport = await runDomPatchBench();
  if (domReport) saved.push(domReport.timestampFile);
  const treeReport = await runRouteTreeBench();
  if (treeReport) saved.push(treeReport.timestampFile);
  saved.push(runNavigationPipelineBench().timestampFile);
  saved.push((await runDataGraphBench()).timestampFile);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Done — reports:');
  for (const file of saved) {
    console.log(`   ${file}`);
  }
  console.log('═══════════════════════════════════════════════════════\n');
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
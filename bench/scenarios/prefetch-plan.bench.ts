/**
 * Bench: PrefetchPlanResolver — full match+plan per hover (before debounce).
 * Maps to NAVIGATION_PERF_AUDIT §7.
 *
 * Run: npm run bench:prefetch-plan
 */
import { AuraRoutingUrlMatcher } from '../../src/modules/aura-routing-engine/core/match/url-matcher';
import { PrefetchPlanResolver } from '../../src/modules/aura-routing-engine/core/prefetch/plan';
import { flatMatchableNodes } from '../lib/fixtures';
import { setupMinimalWindow } from '../lib/env';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
import { bench, consume } from '../lib/stats';
const BENCH_ID = 'prefetch-plan';
export function runPrefetchPlanBench(): SavedReport {
  setupMinimalWindow();
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'Prefetch plan resolver benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT §7 hover match before debounce',
    npmScript: 'npm run bench:prefetch-plan',
  });
  session.header();
  const scales = [10, 50, 100] as const;
  const matcher = new AuraRoutingUrlMatcher();
  let generation = 0;
  for (const count of scales) {
    const nodes = flatMatchableNodes(count);
    const resolver = new PrefetchPlanResolver({
      matcher,
      getMatchableNodes: () => nodes,
      getRegistryGeneration: () => generation,
      currentHref: () => '/r-0',
    });
    const targetHref = `/r-${Math.floor(count / 2)}`;
    const ops = 2_000;
    session.beginScenario(`PrefetchPlanResolver.resolve (n=${count})`, ops, 7);
    const cold = bench('resolve (cold cache)', (i) => {
      resolver.clear();
      consume(resolver.resolve(`${targetHref}?i=${i}`));
    }, { ops });
    const warm = bench('resolve (warm cache)', () => {
      consume(resolver.resolve(targetHref));
    }, { ops });
    const best = Math.max(cold.medianOps, warm.medianOps);
    session.recordResult(cold, best, '← simulates each new hover target');
    session.recordResult(warm, best, '← repeat same href');
    session.endScenario();
    generation++;
  }
  session.beginScenario('hover storm: 50 distinct hrefs per sweep', 500, 5);
  const nodes50 = flatMatchableNodes(50);
  const stormResolver = new PrefetchPlanResolver({
    matcher,
    getMatchableNodes: () => nodes50,
    getRegistryGeneration: () => 0,
    currentHref: () => '/r-0',
  });
  const storm = bench('50× resolve per iteration', (i) => {
    stormResolver.clear();
    for (let j = 0; j < 50; j++) {
      consume(stormResolver.resolve(`/r-${j}`));
    }
    void i;
  }, { ops: 500 });
  session.recordResult(storm, storm.medianOps);
  session.endScenario();
  session.footer();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runPrefetchPlanBench();
}
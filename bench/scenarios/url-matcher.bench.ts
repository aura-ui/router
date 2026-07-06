/**
 * Bench: URL matching — O(n) scan, URLPattern compile per candidate.
 * Maps to NAVIGATION_PERF_AUDIT §1–2.
 *
 * Run: npm run bench:url-matcher
 */
import '../lib/dom-bootstrap';
import { AuraRoutingUrlMatcher } from '../../src/modules/aura-routing-engine/core/match/url-matcher';
import { flatMatchableNodes, paramMatchableNodes } from '../lib/fixtures';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
import { bench, consume, DEFAULT_RUNS } from '../lib/stats';
const BENCH_ID = 'url-matcher';
const RUNS = DEFAULT_RUNS;
export function runUrlMatcherBench(): SavedReport {
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'URL matcher benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT §1 URLPattern, §2 O(n) match',
    npmScript: 'npm run bench:url-matcher',
  });
  session.header();
  const matcher = new AuraRoutingUrlMatcher();
  const scales = [10, 50, 100, 500] as const;
  for (const count of scales) {
    const nodes = flatMatchableNodes(count);
    const target = `/r-${Math.floor(count / 2)}`;
    const missTarget = `/missing-${count}`;
    const ops = count <= 50 ? 5_000 : count <= 100 ? 1_000 : 200;
    session.beginScenario(`flat matchPath hit (n=${count})`, ops, RUNS);
    const hit = bench(`hit ${target}`, (i) => {
      const pathname = i % 20 === 0 ? missTarget : target;
      consume(matcher.matchPath(pathname, nodes));
    }, { ops, runs: RUNS });
    const miss = bench(`miss (no match)`, (i) => {
      consume(matcher.matchPath(`/z-${i % count}`, nodes));
    }, { ops, runs: RUNS });
    const best = Math.max(hit.medianOps, miss.medianOps);
    session.recordResult(hit, best);
    session.recordResult(miss, best);
    session.endScenario();
  }
  session.beginScenario('param routes matchPath (n=100, URLPattern)', 3_000, RUNS);
  const paramNodes = paramMatchableNodes(100);
  const paramIdx = 50;
  const paramResult = bench(`match /p-${paramIdx}/:id`, (i) => {
    consume(matcher.matchPath(`/p-${paramIdx}/${i % 10_000}`, paramNodes));
  }, { ops: 3_000, runs: RUNS });
  session.recordResult(paramResult, paramResult.medianOps);
  session.endScenario();
  session.beginScenario('getPathParams alone (URLPattern compile each call)', 10_000, RUNS);
  const pattern = '/users/:id/settings/:tab';
  const cold = bench('new URLPattern per call', (i) => {
    consume(matcher.getPathParams(`/users/${i}/settings/profile`, pattern));
  }, { ops: 10_000, runs: RUNS });
  const patternCache = new Map<string, URLPattern>();
  const warm = bench('cached URLPattern instance', (i) => {
    let p = patternCache.get(pattern);
    if (!p) {
      p = new URLPattern({ pathname: pattern });
      patternCache.set(pattern, p);
    }
    const result = p.exec({ pathname: `/users/${i}/settings/profile` });
    consume(result?.pathname.groups);
  }, { ops: 10_000, runs: RUNS });
  const bestParams = Math.max(cold.medianOps, warm.medianOps);
  session.recordResult(cold, bestParams, '← current as-is');
  session.recordResult(warm, bestParams, '← target shape');
  session.endScenario();
  session.footer();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runUrlMatcherBench();
}

/**
 * Bench: attachNavigationChain — ancestor URLPattern re-match per depth.
 * Maps to NAVIGATION_PERF_AUDIT §5.
 *
 * Run: npm run bench:matched-chain
 */
import '../lib/dom-bootstrap';
import { AuraRoutingUrlMatcher } from '../../src/modules/aura-routing-engine/core/match/url-matcher';
import { attachNavigationChain } from '../../src/modules/aura-routing-engine/core/route-tree/matched-chain';
import { linearChainRouteNodes, nestedDashboardMatchableNodes } from '../lib/fixtures';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
import { bench, consume } from '../lib/stats';
const BENCH_ID = 'matched-chain';
export function runMatchedChainBench(): SavedReport {
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'Matched chain benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT §5 ancestor re-match',
    npmScript: 'npm run bench:matched-chain',
  });
  session.header();
  const matcher = new AuraRoutingUrlMatcher();
  for (const childCount of [2, 5, 10, 20] as const) {
    const { matchableNodes } = nestedDashboardMatchableNodes(childCount);
    const leaf = matchableNodes[childCount - 1]!;
    const pathname = leaf.pattern;
    const ops = 5_000;
    session.beginScenario(
      `toRouteInfo + chain (${childCount} siblings, depth=2)`,
      ops,
      7,
    );
    const full = bench('matchPath + attachNavigationChain', () => {
      const m = matcher.matchPath(pathname, matchableNodes);
      if (!m) return;
      consume(matcher.toRouteInfo(pathname, pathname, '', '', m.node, m.params));
    }, { ops });
    const leafOnly = bench('matchPath only (no chain)', () => {
      consume(matcher.matchPath(pathname, matchableNodes));
    }, { ops });
    const best = Math.max(full.medianOps, leafOnly.medianOps);
    session.recordResult(full, best);
    session.recordResult(
      leafOnly,
      best,
      `overhead ~${Math.round((1 - leafOnly.medianOps / full.medianOps) * 100)}%`,
    );
    session.endScenario();
  }
  for (const depth of [2, 3, 5, 8] as const) {
    const { leaf, matchableNodes } = linearChainRouteNodes(depth);
    const pathname = leaf.pattern;
    const ops = 3_000;
    session.beginScenario(`attachNavigationChain (linear depth=${depth})`, ops, 7);
    const chainOnly = bench('attachNavigationChain only', () => {
      consume(
        attachNavigationChain(
          leaf,
          { href: pathname, pathname, search: '', hash: '' },
          (p, pat) => matcher.getPathParams(p, pat),
        ),
      );
    }, { ops });
    const full = bench('matchPath + toRouteInfo', () => {
      const m = matcher.matchPath(pathname, matchableNodes);
      if (!m) return;
      consume(matcher.toRouteInfo(pathname, pathname, '', '', m.node, m.params));
    }, { ops });
    const best = Math.max(chainOnly.medianOps, full.medianOps);
    session.recordResult(chainOnly, best);
    session.recordResult(full, best);
    session.endScenario();
  }
  session.footer();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runMatchedChainBench();
}
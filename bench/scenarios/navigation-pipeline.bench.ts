/**
 * Bench: canUseFastPath gate + buildTransitionPlan selection overhead.
 * Maps to NAVIGATION_PERF_AUDIT §8.
 *
 * Run: npm run bench:navigation-pipeline
 */
import '../lib/dom-bootstrap';
import { canUseFastPath } from '../../src/modules/aura-routing-engine/core/route-tree/can-use-fast-path';
import { buildTransitionPlan } from '../../src/modules/aura-routing-engine/core/route-tree/transition-plan';
import { matchedLeaf, nestedChain } from '../lib/fixtures';
import { createTestRoute } from '../../src/modules/aura-routing-engine/test/helpers/create-test-route';
import type { MatchedRouteInfo } from '../../src/modules/aura-routing-engine/core/match/url-matcher';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
const BENCH_ID = 'navigation-pipeline';
function withRouteFlags(
  base: MatchedRouteInfo,
  overrides: Parameters<typeof createTestRoute>[1],
): MatchedRouteInfo {
  return {
    ...base,
    route: createTestRoute(base.pathname, overrides) as MatchedRouteInfo['route'],
  };
}
export function runNavigationPipelineBench(): SavedReport {
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'Navigation pipeline gate benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT §8 fast path eligibility',
    npmScript: 'npm run bench:navigation-pipeline',
  });
  session.header();
  const flatFrom = matchedLeaf('/a');
  const flatTo = matchedLeaf('/b');
  session.runScenario(
    'canUseFastPath (trivial flat eligible)',
    [
      {
        name: 'plan + canUseFastPath',
        fn: () => {
          const plan = buildTransitionPlan(flatFrom, flatTo);
          canUseFastPath(plan, flatFrom, flatTo);
        },
      },
    ],
    { ops: 100_000 },
  );
  const guardedTo = withRouteFlags(flatTo, { guard: ['auth'] });
  session.runScenario(
    'canUseFastPath (guard → ineligible)',
    [
      {
        name: 'plan + canUseFastPath',
        fn: () => {
          const plan = buildTransitionPlan(flatFrom, guardedTo);
          canUseFastPath(plan, flatFrom, guardedTo);
        },
      },
    ],
    { ops: 100_000 },
  );
  const nestedTo = nestedChain('/app', '/app/page')[1]!;
  const nestedFrom = nestedChain('/app', '/app/other')[1]!;
  session.runScenario(
    'canUseFastPath (nested sibling — multi-route plan)',
    [
      {
        name: 'plan + canUseFastPath',
        fn: () => {
          const plan = buildTransitionPlan(nestedFrom, nestedTo);
          canUseFastPath(plan, nestedFrom, nestedTo);
        },
      },
    ],
    { ops: 50_000 },
  );
  session.runScenario(
    'hasSyncContent getter (not wired to pipeline)',
    [
      {
        name: 'read hasSyncContent',
        fn: () => {
          void createTestRoute('/static').hasSyncContent;
        },
      },
    ],
    { ops: 200_000 },
  );
  session.footer();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runNavigationPipelineBench();
}

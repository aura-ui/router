/**
 * Bench: buildTransitionPlan — sibling / cold / branch-exit scenarios.
 *
 * Run: npm run bench:transition-plan
 */
import { buildTransitionPlan } from '../../src/modules/aura-routing-engine/core/route-tree/transition-plan';
import { matchedLeaf, nestedChain } from '../lib/fixtures';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
const BENCH_ID = 'transition-plan';
export function runTransitionPlanBench(): SavedReport {
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'Transition plan benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT — buildTransitionPlan hot path',
    npmScript: 'npm run bench:transition-plan',
  });
  session.header();
  const profileChain = nestedChain('/app', '/app/profile');
  const securityChain = nestedChain('/app', '/app/security');
  const fromProfile = profileChain[profileChain.length - 1]!;
  const toSecurity = securityChain[securityChain.length - 1]!;
  session.runScenario(
    'sibling switch /app/profile → /app/security',
    [{ name: 'buildTransitionPlan', fn: () => { buildTransitionPlan(fromProfile, toSecurity); } }],
    { ops: 50_000 },
  );
  session.runScenario(
    'cold enter null → /app/profile',
    [{ name: 'buildTransitionPlan', fn: () => { buildTransitionPlan(null, fromProfile); } }],
    { ops: 50_000 },
  );
  session.runScenario(
    'branch exit /app/profile → /',
    [
      {
        name: 'buildTransitionPlan',
        fn: () => {
          buildTransitionPlan(fromProfile, matchedLeaf('/'));
        },
      },
    ],
    { ops: 50_000 },
  );
  session.runScenario(
    'param update same leaf /app/profile?a → ?b',
    [
      {
        name: 'buildTransitionPlan (update)',
        fn: () => {
          const a = { ...fromProfile, href: '/app/profile?tab=1', search: '?tab=1' };
          const b = { ...fromProfile, href: '/app/profile?tab=2', search: '?tab=2' };
          buildTransitionPlan(a, b);
        },
      },
    ],
    { ops: 50_000 },
  );
  session.footer();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runTransitionPlanBench();
}
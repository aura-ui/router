/**
 * Bench: DataGraph — parallel sibling loads vs sequential hooks on one route.
 * Maps to NAVIGATION_PERF_AUDIT §13, §18–19.
 *
 * Run: npm run bench:data-graph
 */
import '../lib/dom-bootstrap';
import { DataGraph } from '../../src/modules/aura-routing-engine/core/data-graph';
import { HookRegistry } from '../../src/modules/aura-routing-engine/core/hooks/registry';
import { HandoffCache } from '../../src/modules/aura-routing-engine/core/resource-graph';
import { createMatchedRoute, createMockTransaction } from '../../src/modules/aura-routing-engine/test/helpers/create-mock-transaction';
import { BenchSession, isBenchMain, type SavedReport } from '../lib/report';
const BENCH_ID = 'data-graph';
const NO_PRESERVE = { view: false, data: false } as const;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function runDataGraphBench(): Promise<SavedReport> {
  const session = new BenchSession({
    id: BENCH_ID,
    title: 'DataGraph benchmark',
    auditRef: 'NAVIGATION_PERF_AUDIT §13 onLoad, §18–19 load parallelism',
    npmScript: 'npm run bench:data-graph',
  });
  session.header();
  const registry = new HookRegistry();
  const graph = new DataGraph(new HandoffCache(), {
    hooks: registry,
    cache: { staleTime: 30_000 },
  });
  registry.register({
    name: 'slow-a',
    version: '1.0.0',
    fn: async () => {
      await delay(1);
      return { a: 1 };
    },
  });
  registry.register({
    name: 'slow-b',
    version: '1.0.0',
    fn: async () => {
      await delay(1);
      return { b: 2 };
    },
  });
  registry.register({
    name: 'slow-c',
    version: '1.0.0',
    fn: async () => {
      await delay(1);
      return { c: 3 };
    },
  });
  const enterTwo = [
    createMatchedRoute('/parent', { load: ['slow-a'], preserve: NO_PRESERVE }),
    createMatchedRoute('/parent/child', { load: ['slow-b'], preserve: NO_PRESERVE }),
  ];
  enterTwo[1]!.chain = enterTwo;
  const tx = createMockTransaction({ enterRoutes: enterTwo });
  await session.runScenarioAsync(
    'DataGraph.load 2 sibling routes (parallel)',
    [
      {
        name: '2× 1ms hooks parallel',
        fn: async () => {
          await graph.load(enterTwo, { activeChain: enterTwo, transaction: tx });
        },
        note: '~2ms wall (parallel, no cache)',
      },
    ],
    { ops: 200 },
  );
  const singleMulti = createMatchedRoute('/multi', {
    load: ['slow-a', 'slow-b', 'slow-c'],
    preserve: NO_PRESERVE,
  });
  const txSingle = createMockTransaction({ enterRoutes: [singleMulti] });
  await session.runScenarioAsync(
    'DataGraph.load 3 hooks one route (sequential)',
    [
      {
        name: '3× 1ms hooks sequential',
        fn: async () => {
          await graph.load([singleMulti], { activeChain: [singleMulti], transaction: txSingle });
        },
        note: '~3ms wall (sequential, no cache)',
      },
    ],
    { ops: 100 },
  );
  session.footer();
  graph.destroy();
  return session.save();
}
if (isBenchMain(import.meta.url)) {
  runDataGraphBench();
}

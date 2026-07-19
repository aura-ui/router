jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

/**
 * E6 — pipeline prepare boundary is ResourceGraph only.
 * When prepare is stubbed, mock `resourceGraph.load`; never `dataGraph` / `viewGraph`.
 */
describe('NavigationTransactionPipeline ResourceGraph prepare boundary (E6)', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it.each([
    ['runLoads', async (pipeline: NavigationTransactionPipeline) => pipeline.runLoads()],
    ['runUpdate', async (pipeline: NavigationTransactionPipeline) => pipeline.runUpdate()],
    [
      'runSpeculativePrepare',
      async (pipeline: NavigationTransactionPipeline) => pipeline.runSpeculativePrepare(),
    ],
  ] as const)('%s stubs only resourceGraph.load (not dataGraph / viewGraph)', async (_name, run) => {
    const enter = createMatchedRoute('/page', { load: ['data'], update: ['sync'] });
    const transaction = createMockTransaction({
      enterRoutes: [enter],
      update: _name === 'runUpdate',
      transitionOrder: null,
    });

    const rgLoad = jest
      .spyOn(transaction.engine.resourceGraph, 'load')
      .mockResolvedValue({
        data: new Map([[enter.dataKey!, { ok: true }]]),
        view: ['<span/>'],
      });
    const dataLoad = jest.spyOn(transaction.engine.dataGraph, 'load');
    const viewLoad = jest.spyOn(transaction.engine.viewGraph, 'load');

    await run(new NavigationTransactionPipeline(transaction));

    expect(rgLoad).toHaveBeenCalledTimes(1);
    expect(rgLoad).toHaveBeenCalledWith(
      [enter],
      expect.objectContaining({
        transaction,
        branch: expect.any(Array),
      }),
    );
    expect(dataLoad).not.toHaveBeenCalled();
    expect(viewLoad).not.toHaveBeenCalled();

    rgLoad.mockRestore();
    dataLoad.mockRestore();
    viewLoad.mockRestore();
  });

  it('runLoads / runUpdate wire RG result onto transaction snapshots', async () => {
    const enter = createMatchedRoute('/page', { load: ['data'], update: ['sync'] });
    const data = new Map([[enter.dataKey!, { id: 9 }]]);
    const view = ['<wired/>'];

    for (const mode of ['loads', 'update'] as const) {
      const transaction = createMockTransaction({
        enterRoutes: [enter],
        update: mode === 'update',
        transitionOrder: null,
      });
      jest.spyOn(transaction.engine.resourceGraph, 'load').mockResolvedValue({ data, view });

      const pipeline = new NavigationTransactionPipeline(transaction);
      if (mode === 'loads') {
        await expect(pipeline.runLoads()).resolves.toBeNull();
      } else {
        await expect(pipeline.runUpdate()).resolves.toEqual({ status: 'navigationSucceeded' });
      }

      expect(transaction.dataSnapshot).toBe(data);
      expect(transaction.viewSnapshot).toBe(view);
    }
  });

  it('unmocked runLoads enters via resourceGraph then dataGraph (no direct viewGraph prepare)', async () => {
    const enter = createMatchedRoute('/page', { load: ['fetch'] });
    const transaction = createMockTransaction({
      enterRoutes: [enter],
      transitionOrder: null,
    });
    transaction.engine.hooksRegistry.register({
      name: 'fetch',
      version: '1.0.0',
      fn: async () => ({ ok: true }),
    });

    const rgLoad = jest.spyOn(transaction.engine.resourceGraph, 'load');
    const dataLoad = jest.spyOn(transaction.engine.dataGraph, 'load');
    const viewLoad = jest.spyOn(transaction.engine.viewGraph, 'load');

    await expect(
      new NavigationTransactionPipeline(transaction).runLoads(),
    ).resolves.toBeNull();

    expect(rgLoad).toHaveBeenCalledTimes(1);
    expect(dataLoad).toHaveBeenCalledTimes(1);
    // ViewGraph is invoked by ResourceGraph (mock view graph), not by the pipeline.
    expect(viewLoad).toHaveBeenCalled();
    expect(rgLoad.mock.invocationCallOrder[0]!).toBeLessThan(
      dataLoad.mock.invocationCallOrder[0]!,
    );

    rgLoad.mockRestore();
    dataLoad.mockRestore();
    viewLoad.mockRestore();
  });
});

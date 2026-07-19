jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import {
  defaultDomCache,
  domCacheKey,
  RouteDomCache,
} from '../../../aura-route/core/view/dom-cache';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { createMatchedRoute, createMockEngine } from '../helpers/create-mock-transaction';
import { DEFAULT_PUSH_NAV_OPTIONS } from '../helpers/jest/constants';
import { mockRunPhaseHooks, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransaction.run fast path selection', () => {
  beforeEach(() => {
    resetPipelineMocks();
    RouteDomCache.configure({ max: 5, gcTime: Infinity, gcSweepInterval: false });
  });

  it('selects runFastPipeline for sync flat navigation', async () => {
    const engine = createMockEngine();
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b');
    const transaction = new NavigationTransaction(
      1,
      {
        from,
        to,
        action: 'push',
        href: to.href,
        hash: '',
        options: DEFAULT_PUSH_NAV_OPTIONS,
      },
      () => false,
      engine,
    );

    const fastSpy = jest
      .spyOn(NavigationTransactionPipeline.prototype, 'runFastPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });
    const fullSpy = jest
      .spyOn(NavigationTransactionPipeline.prototype, 'runFullPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });
    const loadSpy = jest.spyOn(engine.resourceGraph, 'load');

    const result = await transaction.run();

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(fastSpy).toHaveBeenCalledTimes(1);
    expect(fullSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(mockRunPhaseHooks).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'guard' }),
      expect.anything(),
      expect.anything(),
    );

    fastSpy.mockRestore();
    fullSpy.mockRestore();
    loadSpy.mockRestore();
  });

  it('selects runFullPipeline when enter route lacks sync content', async () => {
    const engine = createMockEngine();
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      view: { loader: 'url', content: 'about.html' },
    });
    const transaction = new NavigationTransaction(
      1,
      {
        from,
        to,
        action: 'push',
        href: to.href,
        hash: '',
        options: DEFAULT_PUSH_NAV_OPTIONS,
      },
      () => false,
      engine,
    );

    const fastSpy = jest
      .spyOn(NavigationTransactionPipeline.prototype, 'runFastPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });
    const fullSpy = jest
      .spyOn(NavigationTransactionPipeline.prototype, 'runFullPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });

    await transaction.run();

    expect(fastSpy).not.toHaveBeenCalled();
    expect(fullSpy).toHaveBeenCalledTimes(1);

    fastSpy.mockRestore();
    fullSpy.mockRestore();
  });

  it('selects runFastPipeline when canUseDomCacheFastPath (cache.dom hit)', async () => {
    const engine = createMockEngine();
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      view: { loader: 'url', content: 'about.html' },
      cache: { dom: true, view: false, data: true },
    });
    defaultDomCache.put(domCacheKey(to, to.route.path), document.createElement('div'));

    const transaction = new NavigationTransaction(
      1,
      {
        from,
        to,
        action: 'push',
        href: to.href,
        hash: '',
        options: DEFAULT_PUSH_NAV_OPTIONS,
      },
      () => false,
      engine,
    );

    const fastSpy = jest
      .spyOn(NavigationTransactionPipeline.prototype, 'runFastPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });
    const fullSpy = jest
      .spyOn(NavigationTransactionPipeline.prototype, 'runFullPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });
    const loadSpy = jest.spyOn(engine.resourceGraph, 'load');

    await transaction.run();

    expect(fastSpy).toHaveBeenCalledTimes(1);
    expect(fullSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();

    fastSpy.mockRestore();
    fullSpy.mockRestore();
    loadSpy.mockRestore();
  });
});

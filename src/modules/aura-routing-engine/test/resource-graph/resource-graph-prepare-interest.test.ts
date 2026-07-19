import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import { HandoffCache, ResourceGraph } from '../../core/resource-graph';
import type { ViewGraph } from '../../core/view-graph';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

function createResources(handoff: HandoffCache): ResourceGraph {
  return new ResourceGraph(
    { loadView: jest.fn() } as unknown as ViewGraph,
    new DataGraph(handoff, { hooks: new HookRegistry() }),
    handoff,
  );
}

describe('ResourceGraph shared buffer hold', () => {
  it('keeps overlapping data handoff work alive until the hold is unheld', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);

    const to = createMatchedRoute('/items', { load: ['data'], cache: NO_CACHE });
    const key = to.dataKey!;
    const prior = handoff.hold(key, 'navigation');
    const { workSignal } = prior;

    const hold = resources.holdSharedBufferFor(to);
    prior.release();
    expect(workSignal.aborted).toBe(false);

    hold.unhold();
    expect(workSignal.aborted).toBe(true);

    handoff.destroy();
  });

  it('pins viewKey so overlapping view handoff survives until unhold', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);

    const to = createMatchedRoute('/about', {
      load: null,
      view: { loader: 'html', content: '<p>about</p>' },
      cache: NO_CACHE,
    });
    expect(to.viewKey).toBeTruthy();

    const prior = handoff.hold(to.viewKey!, 'navigation');
    const { workSignal } = prior;

    const hold = resources.holdSharedBufferFor(to);
    prior.release();
    expect(workSignal.aborted).toBe(false);
    expect(handoff.waiterCount(to.viewKey!)).toBe(1);

    hold.unhold();
    expect(workSignal.aborted).toBe(true);

    handoff.destroy();
  });

  it('unholding an older hold does not drop a newer supersede hold', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);

    const routeB = createMatchedRoute('/b', { load: ['data'], cache: NO_CACHE });
    const routeC = createMatchedRoute('/c', { load: ['data'], cache: NO_CACHE });
    // Same data identity so both holds pin one generation.
    routeC.dataKey = routeB.dataKey;

    const prior = handoff.hold(routeB.dataKey!, 'navigation');
    const { workSignal } = prior;

    const holdB = resources.holdSharedBufferFor(routeB);
    const holdC = resources.holdSharedBufferFor(routeC);
    prior.release();

    // B’s run finally must not tear down C.
    holdB.unhold();
    expect(workSignal.aborted).toBe(false);
    expect(handoff.waiterCount(routeB.dataKey!)).toBe(1);

    holdC.unhold();
    expect(workSignal.aborted).toBe(true);

    handoff.destroy();
  });

  it('hold.unhold is idempotent', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);
    const to = createMatchedRoute('/x', { load: ['data'], cache: NO_CACHE });

    const hold = resources.holdSharedBufferFor(to);
    hold.unhold();
    expect(() => hold.unhold()).not.toThrow();
    expect(handoff.waiterCount(to.dataKey!)).toBe(0);

    handoff.destroy();
  });
});

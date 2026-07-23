import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import { HandoffCache, ResourceGraph } from '../../core/resource-graph';
import type { ViewGraph } from '../../core/view-graph';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';

function createResources(handoff: HandoffCache): ResourceGraph {
  const hooks = new HookRegistry();
  return new ResourceGraph({
    hooks,
    viewGraph: { loadView: jest.fn() } as unknown as ViewGraph,
    dataGraph: new DataGraph(handoff, { hooks }),
    sharedBuffer: handoff,
  });
}

describe('ResourceGraph pinSharedBufferFor', () => {
  it('keeps overlapping data handoff work alive until unpin', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);

    const to = createMatchedRoute('/items', { load: ['data'], cache: NO_CACHE });
    const key = to.dataKey!;
    const prior = handoff.hold(key, 'navigation');
    const { workSignal } = prior;

    const hold = resources.pinSharedBufferFor(to);
    prior.release();
    expect(workSignal.aborted).toBe(false);

    hold.unpin();
    expect(workSignal.aborted).toBe(true);

    handoff.destroy();
  });

  it('pins viewKey so overlapping view handoff survives until unpin', () => {
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

    const hold = resources.pinSharedBufferFor(to);
    prior.release();
    expect(workSignal.aborted).toBe(false);
    expect(handoff.waiterCount(to.viewKey!)).toBe(1);

    hold.unpin();
    expect(workSignal.aborted).toBe(true);

    handoff.destroy();
  });

  it('unpinning an older pin does not drop a newer supersede pin', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);

    const routeB = createMatchedRoute('/b', { load: ['data'], cache: NO_CACHE });
    const routeC = createMatchedRoute('/c', { load: ['data'], cache: NO_CACHE });
    // Same data identity so both holds pin one generation.
    routeC.dataKey = routeB.dataKey;

    const prior = handoff.hold(routeB.dataKey!, 'navigation');
    const { workSignal } = prior;

    const holdB = resources.pinSharedBufferFor(routeB);
    const holdC = resources.pinSharedBufferFor(routeC);
    prior.release();

    // B’s run finally must not tear down C.
    holdB.unpin();
    expect(workSignal.aborted).toBe(false);
    expect(handoff.waiterCount(routeB.dataKey!)).toBe(1);

    holdC.unpin();
    expect(workSignal.aborted).toBe(true);

    handoff.destroy();
  });

  it('unpin is idempotent', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);
    const to = createMatchedRoute('/x', { load: ['data'], cache: NO_CACHE });

    const hold = resources.pinSharedBufferFor(to);
    hold.unpin();
    expect(() => hold.unpin()).not.toThrow();
    expect(handoff.waiterCount(to.dataKey!)).toBe(0);

    handoff.destroy();
  });

  it('pin alone does not abort prefetch-idle work (early B fail must keep warmup)', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);
    const to = createMatchedRoute('/warmup', { load: ['data'], cache: NO_CACHE });
    const key = to.dataKey!;

    const prefetch = handoff.hold(key, 'prefetch');
    const { workSignal } = prefetch;
    prefetch.release();
    expect(workSignal.aborted).toBe(false);

    // Supersede pin for B, then B fails before prepare — must not kill prefetch generation.
    const hold = resources.pinSharedBufferFor(to);
    hold.unpin();

    expect(workSignal.aborted).toBe(false);
    const again = handoff.hold(key, 'navigation');
    expect(again.workSignal).toBe(workSignal);
    again.release();

    handoff.destroy();
  });

  it('defers work abort until unpin after navigation prepare releases', () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);
    const to = createMatchedRoute('/page', { load: ['data'], cache: NO_CACHE });
    const key = to.dataKey!;

    // Supersede pin for whole B.run(), then prepare takes a real navigation hold.
    const pin = resources.pinSharedBufferFor(to);
    const prepare = handoff.hold(key, 'navigation');
    const { workSignal } = prepare;

    prepare.release();
    expect(workSignal.aborted).toBe(false);
    expect(handoff.waiterCount(key)).toBe(1);

    pin.unpin();
    expect(workSignal.aborted).toBe(true);

    handoff.destroy();
  });

  it('pin/unpin keeps in-flight handoff resolve joinable without a second load', async () => {
    const handoff = new HandoffCache();
    const resources = createResources(handoff);
    const to = createMatchedRoute('/warmup', { load: ['data'], cache: NO_CACHE });
    const key = to.dataKey!;

    let loads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const prefetch = handoff.hold(key, 'prefetch');
    const { workSignal } = prefetch;

    const pending = handoff.resolve(key, async () => {
      loads++;
      await Promise.race([
        gate,
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            reject(workSignal.reason ?? new DOMException('Aborted', 'AbortError'));
          };
          if (workSignal.aborted) onAbort();
          else workSignal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
      return { n: 1 };
    });

    prefetch.release();

    // Early B fail: pin then unpin — must not abort shared work / force a second resolve.
    const pin = resources.pinSharedBufferFor(to);
    pin.unpin();
    expect(workSignal.aborted).toBe(false);

    const joined = handoff.resolve(key, async () => {
      loads++;
      return { n: 2 };
    });
    release();

    await expect(pending).resolves.toEqual({ n: 1 });
    await expect(joined).resolves.toEqual({ n: 1 });
    expect(loads).toBe(1);

    handoff.destroy();
  });
});

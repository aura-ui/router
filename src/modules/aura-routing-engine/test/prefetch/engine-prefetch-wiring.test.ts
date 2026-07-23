import type { LoaderFn } from '../../core';
import { LoaderRegistry } from '../../core/view-graph';
import { createEngineHarness } from '../_helpers/engine-harness';
import { collectRoutesFromDom, createDomRoute } from '../_helpers/test-route-dom';

describe('AuraRoutingEngine prefetch wiring', () => {
  it('prefetch loads content for matched branch via registry descriptors', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let loads = 0;
    registry.register(
      'html',
      (async () => {
        loads++;
        return '<span>about</span>';
      }) as unknown as LoaderFn,
    );

    const about = createDomRoute('/about');
    about.setAttribute('view', 'html::<p>about</p>');

    const { engine } = createEngineHarness({
      viewRegistry: registry,
      routes: collectRoutesFromDom(createDomRoute('/'), about),
      startProvider: false,
    });

    await engine.prefetch('/about');

    expect(loads).toBe(1);
  });

  it('disables prefetch when config.prefetch is false', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let loads = 0;
    registry.register(
      'html',
      (async () => {
        loads++;
        return 'x';
      }) as unknown as LoaderFn,
    );

    const about = createDomRoute('/about');
    about.setAttribute('view', 'html::x');

    const { engine } = createEngineHarness({
      viewRegistry: registry,
      prefetch: false,
      routes: collectRoutesFromDom(about),
      startProvider: false,
    });

    await engine.prefetch('/about');

    expect(loads).toBe(0);
  });
});

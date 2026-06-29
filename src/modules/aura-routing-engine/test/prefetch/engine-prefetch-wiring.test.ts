import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  DataCache,
  ContentLoadService,
  LoaderRegistry,
} from '../../core';
import type { RouterInstance } from '../../core';
import { collectRoutesFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('AuraRoutingEngine prefetch wiring', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('prefetch loads content for matched branch via registry descriptors', async () => {
    const registry = new LoaderRegistry();
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return '<span>about</span>';
    });

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });

    const about = createDomRoute('/about');
    about.setAttribute('view', 'html::<p>about</p>');

    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { contentLoad });
    engine.replaceRoutes(collectRoutesFromDom(createDomRoute('/'), about) as never);

    await engine.prefetch('/about');

    expect(loads).toBe(1);
  });

  it('disables prefetch when config.prefetch is false', async () => {
    const registry = new LoaderRegistry();
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'x';
    });

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });

    const about = createDomRoute('/about');
    about.setAttribute('view', 'html::x');

    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, {
      contentLoad,
      prefetch: false,
    });
    engine.replaceRoutes(collectRoutesFromDom(about) as never);

    await engine.prefetch('/about');

    expect(loads).toBe(0);
  });
});

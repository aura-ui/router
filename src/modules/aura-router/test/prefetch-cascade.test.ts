/** @jest-environment jsdom */

import { resolvePrefetchMode } from '../../aura-routing-engine/core/prefetch/prefetch-policy';
import { AuraRouter } from '../core/aura-router';
import { registerAuraRouterComponents } from '../core/aura-router-setup';

describe('Prefetch cascade link > route > router', () => {
  beforeAll(() => {
    registerAuraRouterComponents();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('route prefetch="false" wins over router intent', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('prefetch', 'intent');
    router.innerHTML = `
      <aura-route path="/quiet" prefetch="false" view="html::x"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');

    const route = router.querySelector('aura-route')!;
    const anchor = document.createElement('a');

    expect(
      resolvePrefetchMode({
        anchor,
        route: route as never,
        routerDefault: 'intent',
      }),
    ).toBeNull();
  });

  it('link data-prefetch wins over route policy', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('prefetch', 'intent');
    router.innerHTML = `
      <aura-route path="/tap" prefetch="false" view="html::x"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');

    const route = router.querySelector('aura-route')!;
    const anchor = document.createElement('a');
    anchor.setAttribute('data-prefetch', 'tap');

    expect(
      resolvePrefetchMode({
        anchor,
        route: route as never,
        routerDefault: 'intent',
      }),
    ).toBe('tap');
  });

  it('inherits router tap when route has no explicit prefetch', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('prefetch', 'tap');
    router.innerHTML = `
      <aura-route path="/feed" view="html::x"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');

    const route = router.querySelector('aura-route')!;
    const anchor = document.createElement('a');

    expect(
      resolvePrefetchMode({
        anchor,
        route: route as never,
        routerDefault: 'intent',
      }),
    ).toBe('tap');
  });
});

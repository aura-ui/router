/** @jest-environment jsdom */

import { AuraRouter } from '../core/aura-router';
import { registerAuraRouterComponents } from '../core/aura-router-setup';

describe('AuraRouter prefetch attr', () => {
  beforeAll(() => {
    registerAuraRouterComponents();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads prefetch policy from the router element', () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('prefetch', 'tap');

    expect(router.prefetchDomAttr).toBe('tap');
  });

  it('disables link prefetch pipeline when prefetch="false"', async () => {
    let loads = 0;
    AuraRouter.registerLoader('prefetch-router-probe', async () => {
      loads++;
      return 'x';
    });

    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('prefetch', 'false');
    router.innerHTML = `
      <aura-outlet></aura-outlet>
      <aura-route path="/about" view="prefetch-router-probe::x"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    router.refreshRoutes();

    await router.prefetch('/about');

    expect(loads).toBe(0);
  });

  it('enables prefetch when prefetch="intent"', async () => {
    let loads = 0;
    AuraRouter.registerLoader('prefetch-router-intent', async () => {
      loads++;
      return 'x';
    });

    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('prefetch', 'intent');
    router.innerHTML = `
      <aura-outlet></aura-outlet>
      <aura-route path="/about" view="prefetch-router-intent::x"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    router.refreshRoutes();

    await router.prefetch('/about');

    expect(loads).toBe(1);
  });
});

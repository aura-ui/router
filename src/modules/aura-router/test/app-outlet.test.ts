/** @jest-environment jsdom */

import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRouter } from '../core/aura-router';
import { registerAuraRouterComponents } from '../core/aura-router-setup';

describe('AuraRouter.appOutlet', () => {
  beforeAll(() => {
    registerAuraRouterComponents();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('reuses an existing document outlet', () => {
    const existing = document.createElement(AuraOutlet.is) as AuraOutlet;
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    document.body.append(existing, router);

    expect(router.appOutlet).toBe(existing);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
  });

  it('creates a sibling outlet before the router when none exists', () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    document.body.append(router);

    const outlet = router.appOutlet;

    expect(outlet).toBeInstanceOf(AuraOutlet);
    expect(outlet.nextElementSibling).toBe(router);
    expect(router.previousElementSibling).toBe(outlet);
    expect(router.contains(outlet)).toBe(false);
  });

  it('memoizes the resolved outlet', () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    document.body.append(router);

    const first = router.appOutlet;
    const second = router.appOutlet;

    expect(second).toBe(first);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
  });

  it('mounts a route view into the auto-created sibling outlet', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = `<aura-route path="/" view="html::<p data-home>home</p>"></aura-route>`;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(router.appOutlet.querySelector('[data-home]')?.textContent).toBe('home');
    expect(router.previousElementSibling).toBe(router.appOutlet);
  });
});

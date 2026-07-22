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

  it('uses outlet attribute selector when set', () => {
    const target = document.createElement(AuraOutlet.is) as AuraOutlet;
    target.id = 'main-outlet';
    const distant = document.createElement(AuraOutlet.is) as AuraOutlet;
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('outlet', '#main-outlet');
    document.body.append(distant, target, router);

    expect(router.appOutlet).toBe(target);
  });

  it('throws when outlet selector does not match an aura-outlet', () => {
    // Keep disconnected — avoid connectedCallback starting a NOT_FOUND recover.
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('outlet', '#missing');

    expect(() => router.appOutlet).toThrow(
      '`<aura-router outlet="#missing">` did not match an `<aura-outlet>`.',
    );
  });

  it('reuses previous sibling outlet', () => {
    const existing = document.createElement(AuraOutlet.is) as AuraOutlet;
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    document.body.append(existing, router);

    expect(router.appOutlet).toBe(existing);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
  });

  it('reuses next sibling outlet', () => {
    const existing = document.createElement(AuraOutlet.is) as AuraOutlet;
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    document.body.append(router, existing);

    expect(router.appOutlet).toBe(existing);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
  });

  it('reuses nested outlet inside the router', () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    const nested = document.createElement(AuraOutlet.is) as AuraOutlet;
    router.append(nested);
    document.body.append(router);

    expect(router.appOutlet).toBe(nested);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
  });

  it('ignores a distant document outlet and creates a sibling', () => {
    const distant = document.createElement(AuraOutlet.is) as AuraOutlet;
    const wrap = document.createElement('div');
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    wrap.append(router);
    document.body.append(distant, wrap);

    const outlet = router.appOutlet;

    expect(outlet).not.toBe(distant);
    expect(outlet.nextElementSibling).toBe(router);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(2);
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

  it('reuses the sibling outlet after disconnect/reconnect and remounts', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = `<aura-route path="/" view="html::<p data-home>home</p>"></aura-route>`;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const outlet = router.appOutlet;
    expect(outlet.querySelector('[data-home]')?.textContent).toBe('home');

    router.remove();
    expect(router.trail).toEqual([]);

    document.body.append(router);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(router.appOutlet).toBe(outlet);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
    expect(router.appOutlet.querySelector('[data-home]')?.textContent).toBe('home');
  });
});

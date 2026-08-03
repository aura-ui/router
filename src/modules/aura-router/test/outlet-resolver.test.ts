/** @jest-environment jsdom */

import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRouter } from '../core/aura-router';
import { installAuraRouter } from '../core/install';
import { resolveAppOutlet } from '../core/outlet-resolver';

describe('resolveAppOutlet', () => {
  beforeAll(() => {
    installAuraRouter();
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

    expect(resolveAppOutlet(router)).toBe(target);
  });

  it('throws when outlet selector does not match an aura-outlet', () => {
    // Keep disconnected — avoid connectedCallback starting a NOT_FOUND recover.
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('outlet', '#missing');

    expect(() => resolveAppOutlet(router)).toThrow(
      '`<aura-router outlet="#missing">` did not match an `<aura-outlet>`.',
    );
  });

  it('reuses the first aura-outlet in the document', () => {
    const existing = document.createElement(AuraOutlet.is) as AuraOutlet;
    const wrap = document.createElement('div');
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    wrap.append(router);
    document.body.append(existing, wrap);

    expect(resolveAppOutlet(router)).toBe(existing);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
  });

  it('reuses a nested outlet inside the router', () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    const nested = document.createElement(AuraOutlet.is) as AuraOutlet;
    router.append(nested);
    document.body.append(router);

    expect(resolveAppOutlet(router)).toBe(nested);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
  });

  it('prefers the first document outlet when several exist', () => {
    const first = document.createElement(AuraOutlet.is) as AuraOutlet;
    const second = document.createElement(AuraOutlet.is) as AuraOutlet;
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    document.body.append(first, second, router);

    expect(resolveAppOutlet(router)).toBe(first);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(2);
  });

  it('creates a sibling outlet before the router when none exists', () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    document.body.append(router);

    const outlet = resolveAppOutlet(router);

    expect(outlet).toBeInstanceOf(AuraOutlet);
    expect(outlet.nextElementSibling).toBe(router);
    expect(router.previousElementSibling).toBe(outlet);
    expect(router.contains(outlet)).toBe(false);
  });
});

describe('AuraRouter.appOutlet', () => {
  beforeAll(() => {
    installAuraRouter();
  });

  afterEach(() => {
    document.body.replaceChildren();
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

  it('reuses a distant document outlet after disconnect/reconnect and remounts', async () => {
    const existing = document.createElement(AuraOutlet.is) as AuraOutlet;
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = `<aura-route path="/" view="html::<p data-home>home</p>"></aura-route>`;
    const wrap = document.createElement('div');
    wrap.append(router);
    document.body.append(existing, wrap);

    await customElements.whenDefined('aura-route');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(router.appOutlet).toBe(existing);
    expect(existing.querySelector('[data-home]')?.textContent).toBe('home');

    router.remove();
    expect(router.activeRouteBranch).toEqual([]);

    wrap.append(router);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(router.appOutlet).toBe(existing);
    expect(document.querySelectorAll(AuraOutlet.is)).toHaveLength(1);
    expect(router.appOutlet.querySelector('[data-home]')?.textContent).toBe('home');
  });
});

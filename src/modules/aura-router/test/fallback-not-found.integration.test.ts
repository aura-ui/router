/** @jest-environment jsdom */

import { AuraRouter } from '../core/aura-router';
import { installAuraRouter } from '../core/install';
import { AURA_ROUTER_NOT_FOUND } from '../core/navigation-events';

async function flushNavigation(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('AuraRouter fallback not-found (ensureEngine onNotFound)', () => {
  beforeAll(() => {
    installAuraRouter();
  });

  beforeEach(() => {
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/');
  });

  async function mount(): Promise<AuraRouter> {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = `
      <aura-outlet></aura-outlet>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
    `;
    document.body.append(router);
    await customElements.whenDefined('aura-route');
    await flushNavigation();
    return router;
  }

  it('renders default fallback UI on unmatched navigation', async () => {
    const router = await mount();
    const seen: Array<{ url: string; source: string }> = [];
    router.addEventListener(AURA_ROUTER_NOT_FOUND, ((event: CustomEvent) => {
      seen.push({ url: event.detail.url, source: event.detail.source });
    }) as EventListener);

    router.navigate('/missing');
    await flushNavigation();

    expect(seen).toEqual([{ url: '/missing', source: 'fallback' }]);
    expect(router.appOutlet.textContent).toContain('Page not found: /missing');
  });

  it('uses router error-template as fallback UI when path="*" is absent', async () => {
    const template = document.createElement('template');
    template.id = 'host-error';
    template.innerHTML = '<h1>oops</h1><span data-not-found-url></span>';
    document.body.append(template);

    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('error-template', 'host-error');
    router.innerHTML = `
      <aura-outlet></aura-outlet>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
    `;
    document.body.append(router);
    await customElements.whenDefined('aura-route');
    await flushNavigation();

    router.navigate('/gone');
    await flushNavigation();

    expect(router.appOutlet.querySelector('h1')?.textContent).toBe('oops');
    expect(router.appOutlet.querySelector('[data-not-found-url]')?.textContent).toBe('/gone');
  });

  it('skips fallback UI when not-found listener calls preventDefault', async () => {
    const router = await mount();
    router.addEventListener(AURA_ROUTER_NOT_FOUND, (event) => {
      event.preventDefault();
    });

    router.navigate('/blocked');
    await flushNavigation();

    expect(router.appOutlet.textContent ?? '').not.toContain('Page not found');
    expect(router.appOutlet.querySelector('[data-not-found-url]')).toBeNull();
  });

  it('clears active link class when URL commits to unmatched path', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('link-active-class', 'is-active');
    router.innerHTML = `
      <nav>
        <a href="/" data-aura-link>Home</a>
        <a href="/about" data-aura-link>About</a>
      </nav>
      <aura-outlet></aura-outlet>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
    `;
    document.body.append(router);
    await customElements.whenDefined('aura-route');
    await flushNavigation();

    const home = router.querySelector<HTMLAnchorElement>('a[href="/"]')!;
    expect(home.classList.contains('is-active')).toBe(true);
    expect(home.getAttribute('aria-current')).toBe('page');

    router.navigate('/missing');
    await flushNavigation();

    expect(window.location.pathname).toBe('/missing');
    expect(home.classList.contains('is-active')).toBe(false);
    expect(home.hasAttribute('aria-current')).toBe(false);
    expect(router.activeRouteBranch).toEqual([]);
  });
});

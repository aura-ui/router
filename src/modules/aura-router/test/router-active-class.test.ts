/** @jest-environment jsdom */

import { matchLinkActive } from '../../aura-routing-engine/core/link-active/match';
import type { RouteHookDefinition } from '../../aura-routing-engine/core';
import { splitAppHref } from '../../aura-utils/misc/url';
import { AuraRouter } from '../core/aura-router';
import { installAuraRouter } from '../core/install';
import { getRouterEngine } from './helpers/get-router-engine';

async function flushNavigation(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('AuraRouter link-active-class', () => {
  beforeAll(() => {
    installAuraRouter();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function mountRouter(withActiveClass: boolean): Promise<{
    router: AuraRouter;
    home: HTMLAnchorElement;
    about: HTMLAnchorElement;
  }> {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    if (withActiveClass) {
      router.setAttribute('link-active-class', 'is-active');
    }
    router.innerHTML = `
      <nav>
        <a href="/" aura-router-link>Home</a>
        <a href="/about" aura-router-link>About</a>
      </nav>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route path="/about" view="html::<p>about</p>"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    const links = router.querySelectorAll<HTMLAnchorElement>('[aura-router-link]');
    return { router, home: links[0]!, about: links[1]! };
  }

  it('marks the link for the current route after initial navigation', async () => {
    const { home, about } = await mountRouter(true);

    expect(home.classList.contains('is-active')).toBe(true);
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(about.classList.contains('is-active')).toBe(false);
  });

  it('marks active link on system boot before transitionIn finishes', async () => {
    let releaseTransition!: () => void;
    const transitionGate = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    });

    AuraRouter.use({
      name: 'slow-fade-active-test',
      version: '1.0.0',
      fn: async (ctx) => {
        if (ctx.phase === 'transitionIn') await transitionGate;
      },
    });

    window.history.replaceState({}, '', '/about');
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('link-active-class', 'is-active');
    router.setAttribute('transition', 'slow-fade-active-test');
    router.setAttribute('transition-order', 'parallel');
    router.innerHTML = `
      <nav>
        <a href="/" aura-router-link>Home</a>
        <a href="/about" aura-router-link>About</a>
      </nav>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route path="/about" view="html::<p>about</p>"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    const links = router.querySelectorAll<HTMLAnchorElement>('[aura-router-link]');
    const home = links[0]!;
    const about = links[1]!;

    expect(about.classList.contains('is-active')).toBe(true);
    expect(about.getAttribute('aria-current')).toBe('page');
    expect(home.classList.contains('is-active')).toBe(false);

    releaseTransition();
    await flushNavigation();
    AuraRouter.unuse('slow-fade-active-test');
  });

  it('updates active class after programmatic navigation', async () => {
    const { router, home, about } = await mountRouter(true);

    router.navigate('/about');
    await flushNavigation();

    expect(home.classList.contains('is-active')).toBe(false);
    expect(about.classList.contains('is-active')).toBe(true);
    expect(about.getAttribute('aria-current')).toBe('page');
  });

  it('re-syncs active class on links that arrive with the new view', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('link-active-class', 'is-active');
    router.innerHTML = `
      <nav>
        <a href="/" aura-router-link>Home</a>
        <a href="/about" aura-router-link>About</a>
      </nav>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route
        path="/about"
        view="html::<p>about</p><a href=&quot;/about&quot; aura-router-link data-testid=&quot;in-view&quot;>About in view</a>"
      ></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    expect(router.appOutlet.querySelector('[data-testid="in-view"]')).toBeNull();

    router.navigate('/about');
    await flushNavigation();

    const inView = router.appOutlet.querySelector<HTMLAnchorElement>('[data-testid="in-view"]');
    expect(inView).not.toBeNull();
    expect(inView!.classList.contains('is-active')).toBe(true);
    expect(inView!.getAttribute('aria-current')).toBe('page');
  });

  it('link matchers reflect the settled route via router.activeRouteBranch', async () => {
    const { router } = await mountRouter(true);

    const currentHref = router.activeRouteBranch[router.activeRouteBranch.length - 1]!.href;
    const current = splitAppHref(currentHref);
    expect(matchLinkActive('/', current).exact).toBe(true);
    expect(matchLinkActive('/about', current).exact).toBe(false);

    router.navigate('/about');
    await flushNavigation();

    const nextHref = router.activeRouteBranch[router.activeRouteBranch.length - 1]!.href;
    const next = splitAppHref(nextHref);
    expect(matchLinkActive('/', next).exact).toBe(false);
    expect(matchLinkActive('/about', next).exact).toBe(true);
  });

  it('does nothing when link-active-class is absent', async () => {
    const { home, about } = await mountRouter(false);

    expect(home.classList.contains('is-active')).toBe(false);
    expect(about.classList.contains('is-active')).toBe(false);
    expect(home.hasAttribute('aria-current')).toBe(false);
  });

  it('updates active class on hash-only navigation', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('link-active-class', 'is-active');
    router.innerHTML = `
      <nav>
        <a href="/docs" aura-router-link>Docs</a>
        <a href="/docs#intro" aura-router-link>Intro</a>
        <a href="/docs#faq" aura-router-link>FAQ</a>
      </nav>
      <aura-route path="/docs" view="html::<p>docs</p>"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    const [, intro, faq] = router.querySelectorAll<HTMLAnchorElement>('[aura-router-link]');

    router.navigate('/docs#intro');
    await flushNavigation();

    expect(intro!.classList.contains('is-active')).toBe(true);
    expect(faq!.classList.contains('is-active')).toBe(false);

    router.navigate('/docs#faq');
    await flushNavigation();

    expect(intro!.classList.contains('is-active')).toBe(false);
    expect(faq!.classList.contains('is-active')).toBe(true);
    expect(faq!.getAttribute('aria-current')).toBe('page');
  });

  it('restores active link when returning to committed route while target load is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    AuraRouter.use({
      name: 'slow-load-cancel-pending-active',
      version: '1.0.0',
      fn: (async (ctx: Parameters<RouteHookDefinition['fn']>[0]) => {
        if (ctx.phase === 'load') {
          await gate;
          return { ok: true };
        }
      }) as unknown as RouteHookDefinition['fn'],
    });

    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('link-active-class', 'is-active');
    router.innerHTML = `
      <nav>
        <a href="/" aura-router-link>Home</a>
        <a href="/about" aura-router-link>About</a>
      </nav>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route
        path="/about"
        view="html::<p>about</p>"
        load="slow-load-cancel-pending-active"
      ></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    const bus: string[] = [];
    getRouterEngine(router).events.subscribe((event) => {
      bus.push(event.type);
    });

    const [home, about] = router.querySelectorAll<HTMLAnchorElement>('[aura-router-link]');
    expect(home!.classList.contains('is-active')).toBe(true);

    void router.navigate('/about');
    const started = Date.now();
    while (!bus.includes('navigation:url-aligned')) {
      if (Date.now() - started > 1000) {
        throw new Error(`Timed out waiting for url-aligned; saw ${JSON.stringify(bus)}`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }

    expect(window.location.pathname).toBe('/about');
    expect(about!.classList.contains('is-active')).toBe(true);
    expect(home!.classList.contains('is-active')).toBe(false);

    void router.navigate('/');
    await flushNavigation();

    expect(bus).toContain('navigation:nav-state-restore');
    expect(window.location.pathname).toBe('/');
    expect(home!.classList.contains('is-active')).toBe(true);
    expect(home!.getAttribute('aria-current')).toBe('page');
    expect(about!.classList.contains('is-active')).toBe(false);

    release();
    await flushNavigation();
    AuraRouter.unuse('slow-load-cancel-pending-active');
  });
});

describe('AuraRouter link-active-branch-class and activeRouteBranch', () => {
  beforeAll(() => {
    installAuraRouter();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  it('marks branch nav links on nested routes', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('link-active-class', 'is-active');
    router.setAttribute('link-active-branch-class', 'is-branch-active');
    router.innerHTML = `
      <nav>
        <a href="/app/settings" aura-router-link>Settings</a>
        <a href="/app/settings/profile" aura-router-link>Profile</a>
      </nav>
      <aura-route path="/app/settings" layout="settings-layout">
        <aura-route path="profile" view="html::<p>profile</p>"></aura-route>
      </aura-route>
      <template id="settings-layout"><aura-outlet></aura-outlet></template>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    router.navigate('/app/settings/profile');
    await flushNavigation();

    const current = splitAppHref(router.activeRouteBranch[router.activeRouteBranch.length - 1]!.href);
    expect(matchLinkActive('/app/settings', current).prefix).toBe(true);
    expect(matchLinkActive('/app/settings/profile', current).exact).toBe(true);

    const [settings, profile] = router.querySelectorAll<HTMLAnchorElement>('[aura-router-link]');
    expect(settings!.classList.contains('is-active')).toBe(false);
    expect(settings!.classList.contains('is-branch-active')).toBe(true);
    expect(profile!.classList.contains('is-active')).toBe(true);
    expect(profile!.classList.contains('is-branch-active')).toBe(true);
  });

  it('exposes router.activeRouteBranch root → leaf', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = `
      <aura-route path="/app" layout="app-layout">
        <aura-route path="settings" layout="settings-layout">
          <aura-route path="profile" view="html::<p>profile</p>"></aura-route>
        </aura-route>
      </aura-route>
      <template id="app-layout"><aura-outlet></aura-outlet></template>
      <template id="settings-layout"><aura-outlet></aura-outlet></template>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    router.navigate('/app/settings/profile');
    await flushNavigation();

    expect(router.activeRouteBranch.map((entry) => entry.pattern)).toEqual([
      '/app',
      '/app/settings',
      '/app/settings/profile',
    ]);
  });
});

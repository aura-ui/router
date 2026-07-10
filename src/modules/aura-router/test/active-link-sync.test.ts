/** @jest-environment jsdom */

import { AuraRouter } from '../core/aura-router';
import { registerAuraRouterComponents } from '../core/aura-router-setup';

async function flushNavigation(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('AuraRouter data-router-active-class', () => {
  beforeAll(() => {
    registerAuraRouterComponents();
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
      router.setAttribute('data-router-active-class', 'is-active');
    }
    router.innerHTML = `
      <nav>
        <a href="/" data-router-link>Home</a>
        <a href="/about" data-router-link>About</a>
      </nav>
      <aura-outlet></aura-outlet>
      <aura-route path="/" view="html::<p>home</p>"></aura-route>
      <aura-route path="/about" view="html::<p>about</p>"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    const links = router.querySelectorAll<HTMLAnchorElement>('[data-router-link]');
    return { router, home: links[0]!, about: links[1]! };
  }

  it('marks the link for the current route after initial navigation', async () => {
    const { home, about } = await mountRouter(true);

    expect(home.classList.contains('is-active')).toBe(true);
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(about.classList.contains('is-active')).toBe(false);
  });

  it('updates active class after programmatic navigation', async () => {
    const { router, home, about } = await mountRouter(true);

    router.navigate('/about');
    await flushNavigation();

    expect(home.classList.contains('is-active')).toBe(false);
    expect(about.classList.contains('is-active')).toBe(true);
    expect(about.getAttribute('aria-current')).toBe('page');
  });

  it('does nothing when data-router-active-class is absent', async () => {
    const { home, about } = await mountRouter(false);

    expect(home.classList.contains('is-active')).toBe(false);
    expect(about.classList.contains('is-active')).toBe(false);
    expect(home.hasAttribute('aria-current')).toBe(false);
  });

  it('updates active class on hash-only navigation', async () => {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.setAttribute('data-router-active-class', 'is-active');
    router.innerHTML = `
      <nav>
        <a href="/docs" data-router-link>Docs</a>
        <a href="/docs#intro" data-router-link>Intro</a>
        <a href="/docs#faq" data-router-link>FAQ</a>
      </nav>
      <aura-outlet></aura-outlet>
      <aura-route path="/docs" view="html::<p>docs</p>"></aura-route>
    `;
    document.body.append(router);

    await customElements.whenDefined('aura-route');
    await flushNavigation();

    const [, intro, faq] = router.querySelectorAll<HTMLAnchorElement>('[data-router-link]');

    router.navigate('/docs#intro');
    await flushNavigation();

    expect(intro.classList.contains('is-active')).toBe(true);
    expect(faq.classList.contains('is-active')).toBe(false);

    router.navigate('/docs#faq');
    await flushNavigation();

    expect(intro.classList.contains('is-active')).toBe(false);
    expect(faq.classList.contains('is-active')).toBe(true);
    expect(faq.getAttribute('aria-current')).toBe('page');
  });
});

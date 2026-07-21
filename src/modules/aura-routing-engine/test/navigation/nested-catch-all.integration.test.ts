/** @jest-environment jsdom */

import { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraRouter } from '../../../aura-router/core/aura-router';
import { registerAuraRouterComponents } from '../../../aura-router/core/aura-router-setup';
import { createDomRoute } from '../helpers/test-route-dom';

const SPLAT_LOADER = 'nested-catch-all-splat';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForText(root: ParentNode, text: string, timeout = 3000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (root.textContent?.includes(text)) return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for "${text}"`);
}

type Fixture = {
  router: AuraRouter;
  layoutHeader: () => HTMLElement | null;
};

let splatCaptures: Record<string, string>[] = [];

async function mountNestedCatchAllFixture(): Promise<Fixture> {
  splatCaptures = [];

  document.body.innerHTML = `
    <template id="users-layout">
      <header data-layout-marker>USERS LAYOUT</header>
      <aura-outlet></aura-outlet>
    </template>
  `;

  const profile = createDomRoute('profile');
  profile.setAttribute('view', 'html::<span data-page="profile">PROFILE</span>');

  const fallback = createDomRoute('*');
  fallback.setAttribute('view', `${SPLAT_LOADER}::404`);

  const users = createDomRoute('/users', [profile, fallback]);
  users.setAttribute('layout', 'users-layout');

  registerAuraRouterComponents();
  const router = document.createElement(AuraRouter.is) as AuraRouter;
  router.append(users);
  document.body.append(router);

  await customElements.whenDefined(AuraRoute.is);
  await Promise.resolve();
  router.refreshRoutes();

  return {
    router,
    layoutHeader: () => router.appOutlet.querySelector('[data-layout-marker]'),
  };
}

describe('nested catch-all integration', () => {
  beforeAll(() => {
    AuraRouter.registerLoader(SPLAT_LOADER, (ctx) => {
      splatCaptures.push({ ...(ctx.route.params ?? {}) });
      const splat = ctx.route.params?.splat ?? '';
      return `<span data-not-found>NOT FOUND: ${splat}</span>`;
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    history.replaceState(null, '', '/');
  });

  it('mounts scoped catch-all in nested outlet with layout frame', async () => {
    const { router, layoutHeader } = await mountNestedCatchAllFixture();

    router.navigate('/users/unknown-segment', { replace: false, syncHistory: false });
    await waitForText(router.appOutlet, 'NOT FOUND: unknown-segment');

    expect(layoutHeader()).toBeTruthy();
    expect(router.appOutlet.textContent).toContain('USERS LAYOUT');
    expect(router.appOutlet.querySelector('[data-not-found]')?.textContent).toBe(
      'NOT FOUND: unknown-segment',
    );
  });

  it('keeps layout DOM when navigating profile → unknown sibling', async () => {
    const { router, layoutHeader } = await mountNestedCatchAllFixture();

    router.navigate('/users/profile', { replace: false, syncHistory: false });
    await waitForText(router.appOutlet, 'PROFILE');
    const layoutBefore = layoutHeader();

    router.navigate('/users/no-such-page', { replace: false, syncHistory: false });
    await waitForText(router.appOutlet, 'NOT FOUND: no-such-page');

    expect(layoutHeader()).toBe(layoutBefore);
    expect(router.appOutlet.textContent).toContain('USERS LAYOUT');
    expect(router.appOutlet.textContent).not.toContain('PROFILE');
  });

  it('passes splat param to catch-all loader', async () => {
    const { router } = await mountNestedCatchAllFixture();

    router.navigate('/users/deep/miss', { replace: false, syncHistory: false });
    await waitForText(router.appOutlet, 'NOT FOUND: deep/miss');

    expect(splatCaptures.at(-1)).toEqual({ splat: 'deep/miss' });
  });
});

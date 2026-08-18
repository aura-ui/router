/** @jest-environment jsdom */

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { AURA_ROUTER_SSR_ATTR } from '../../../aura-router/core';
import { hydrate } from '../../core/hydrate/hydrate';
import { createEngineHarness } from '../_helpers/engine-harness';
import {
  createDomRedirectRoute,
  createDomRoute,
} from '../_helpers/test-route-dom';
import type { NavigationTransaction } from '../../core/navigation/navigation-transaction';

function ensureOutletElement(): void {
  if (!customElements.get(AuraOutlet.is)) {
    customElements.define(AuraOutlet.is, AuraOutlet);
  }
}

function stubHydrateHooks(route: HTMLElement & { whenReady?: unknown; adopt?: unknown }) {
  const adopt = jest.fn();
  Object.defineProperties(route, {
    whenReady: {
      configurable: true,
      value: async () => undefined,
    },
    adopt: {
      configurable: true,
      value: adopt,
    },
  });
  return adopt;
}

describe('hydrate', () => {
  beforeAll(() => {
    ensureOutletElement();
  });

  afterEach(() => {
    document.body.replaceChildren();
    history.replaceState(null, '', '/');
  });

  it('flat: adopts via route extract when no aura-router-ssr marker', async () => {
    history.replaceState(null, '', '/about');
    const about = createDomRoute('/about');
    about.setAttribute('extract', '.main');
    const adopt = stubHydrateHooks(about);

    const { engine } = createEngineHarness({
      href: '/about',
      domRoutes: [about],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const initialView = document.createElement('div');
    initialView.className = 'main';
    initialView.textContent = 'ABOUT';
    document.body.append(initialView, rootOutlet);

    const result = await hydrate(null, engine, rootOutlet);

    expect(result).toEqual({ status: 'adopted', leaf: expect.objectContaining({ pathname: '/about' }) });
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(initialView.hasAttribute('data-aura-view-root')).toBe(true);
  });

  it('flat: aura-router-ssr wins over extract when both are present', async () => {
    history.replaceState(null, '', '/about');
    const about = createDomRoute('/about');
    about.setAttribute('extract', '.main');
    const adopt = stubHydrateHooks(about);

    const { engine } = createEngineHarness({
      href: '/about',
      domRoutes: [about],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const ssrView = document.createElement('div');
    ssrView.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    ssrView.textContent = 'SSR';
    const extractView = document.createElement('div');
    extractView.className = 'main';
    extractView.textContent = 'EXTRACT';
    rootOutlet.append(ssrView);
    document.body.append(extractView, rootOutlet);

    const result = await hydrate(ssrView, engine, rootOutlet);

    expect(result.status).toBe('adopted');
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(ssrView.hasAttribute('data-aura-view-root')).toBe(true);
    expect(extractView.hasAttribute('data-aura-view-root')).toBe(false);
  });

  it('flat: no marker and no extract is fallback', async () => {
    history.replaceState(null, '', '/about');
    const about = createDomRoute('/about');
    stubHydrateHooks(about);

    const { engine } = createEngineHarness({
      href: '/about',
      domRoutes: [about],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const orphan = document.createElement('div');
    orphan.className = 'main';
    document.body.append(orphan, rootOutlet);

    await expect(hydrate(null, engine, rootOutlet)).resolves.toEqual({ status: 'fallback' });
  });

  it('tree: extract-only leaf blob is structure-error (ssr marker still needed for shell)', async () => {
    history.replaceState(null, '', '/settings/profile');
    const profile = createDomRoute('profile');
    profile.setAttribute('extract', '.main');
    const settings = createDomRoute('/settings', [profile]);
    stubHydrateHooks(settings);
    stubHydrateHooks(profile);

    const { engine } = createEngineHarness({
      href: '/settings/profile',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const leaf = document.createElement('div');
    leaf.className = 'main';
    leaf.textContent = 'PROFILE';
    document.body.append(leaf, rootOutlet);

    const result = await hydrate(null, engine, rootOutlet);

    expect(result).toEqual({
      status: 'structure-error',
      leaf: expect.objectContaining({ pathname: '/settings/profile' }),
      root: leaf,
    });
  });

  it('flat: single leaf adopts initial view without fetch path', async () => {
    history.replaceState(null, '', '/about');
    const about = createDomRoute('/about');
    const adopt = stubHydrateHooks(about);

    const { engine } = createEngineHarness({
      href: '/about',
      domRoutes: [about],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const initialView = document.createElement('div');
    initialView.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    initialView.textContent = 'ABOUT';
    rootOutlet.append(initialView);
    document.body.append(rootOutlet);

    const result = await hydrate(initialView, engine, rootOutlet);

    expect(result).toEqual({ status: 'adopted', leaf: expect.objectContaining({ pathname: '/about' }) });
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(initialView.hasAttribute('data-aura-view-root')).toBe(true);
  });

  it('tree: adopts layout + leaf when nested markup matches chain', async () => {
    history.replaceState(null, '', '/settings/profile');
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const settingsAdopt = stubHydrateHooks(settings);
    const profileAdopt = stubHydrateHooks(profile);

    const { engine } = createEngineHarness({
      href: '/settings/profile',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const layoutRoot = document.createElement('div');
    layoutRoot.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    layoutRoot.setAttribute('data-aura-view-root', '');

    const nested = document.createElement(AuraOutlet.is) as AuraOutlet;
    const leafRoot = document.createElement('div');
    leafRoot.setAttribute('data-aura-view-root', '');
    leafRoot.textContent = 'PROFILE';
    nested.append(leafRoot);
    layoutRoot.append(nested);
    rootOutlet.append(layoutRoot);
    document.body.append(rootOutlet);

    const result = await hydrate(layoutRoot, engine, rootOutlet);

    expect(result.status).toBe('adopted');
    if (result.status !== 'adopted') return;
    expect(result.leaf.pathname).toBe('/settings/profile');
    expect(result.leaf.chain).toHaveLength(2);
    expect(settingsAdopt).toHaveBeenCalledTimes(1);
    expect(profileAdopt).toHaveBeenCalledTimes(1);
  });

  it('tree: missing leaf data-aura-view-root is structure-error without adopt', async () => {
    history.replaceState(null, '', '/settings/profile');
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const settingsAdopt = stubHydrateHooks(settings);
    const profileAdopt = stubHydrateHooks(profile);

    const { engine } = createEngineHarness({
      href: '/settings/profile',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const layoutRoot = document.createElement('div');
    layoutRoot.setAttribute(AURA_ROUTER_SSR_ATTR, '');

    const nested = document.createElement(AuraOutlet.is) as AuraOutlet;
    const leafRoot = document.createElement('div');
    leafRoot.textContent = 'PROFILE'; // no data-aura-view-root
    nested.append(leafRoot);
    layoutRoot.append(nested);
    rootOutlet.append(layoutRoot);
    document.body.append(rootOutlet);

    const result = await hydrate(layoutRoot, engine, rootOutlet);

    expect(result).toEqual({
      status: 'structure-error',
      leaf: expect.objectContaining({ pathname: '/settings/profile' }),
      root: layoutRoot,
    });
    expect(settingsAdopt).not.toHaveBeenCalled();
    expect(profileAdopt).not.toHaveBeenCalled();
  });

  it('multi-segment without nested outlet is structure-error (no leaf-only adopt)', async () => {
    history.replaceState(null, '', '/settings/profile');
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const settingsAdopt = stubHydrateHooks(settings);
    const profileAdopt = stubHydrateHooks(profile);

    const { engine } = createEngineHarness({
      href: '/settings/profile',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const blob = document.createElement('div');
    blob.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    blob.textContent = 'flat blob';
    rootOutlet.append(blob);
    document.body.append(rootOutlet);

    const result = await hydrate(blob, engine, rootOutlet);

    expect(result.status).toBe('structure-error');
    expect(settingsAdopt).not.toHaveBeenCalled();
    expect(profileAdopt).not.toHaveBeenCalled();
  });

  it('redirect match returns fallback', async () => {
    history.replaceState(null, '', '/old');
    const redirected = createDomRedirectRoute('/old', '/new');
    stubHydrateHooks(redirected);

    const { engine } = createEngineHarness({
      href: '/old',
      domRoutes: [redirected, createDomRoute('/new')],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const initialView = document.createElement('div');
    initialView.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    rootOutlet.append(initialView);
    document.body.append(rootOutlet);

    await expect(hydrate(initialView, engine, rootOutlet)).resolves.toEqual({ status: 'fallback' });
  });

  it('index folder: adopts without rewriting the address bar', async () => {
    history.replaceState(null, '', '/app/settings');
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const settingsAdopt = stubHydrateHooks(settings);
    const indexAdopt = stubHydrateHooks(index);

    const { engine, provider } = createEngineHarness({
      href: '/app/settings',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const layoutRoot = document.createElement('div');
    layoutRoot.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    layoutRoot.setAttribute('data-aura-view-root', '');

    const nested = document.createElement(AuraOutlet.is) as AuraOutlet;
    const leafRoot = document.createElement('div');
    leafRoot.setAttribute('data-aura-view-root', '');
    leafRoot.textContent = 'INDEX';
    nested.append(leafRoot);
    layoutRoot.append(nested);
    rootOutlet.append(layoutRoot);
    document.body.append(rootOutlet);

    const result = await hydrate(layoutRoot, engine, rootOutlet);

    expect(result.status).toBe('adopted');
    if (result.status !== 'adopted') return;
    expect(result.leaf.pathname).toBe('/app/settings');
    expect(result.leaf.href).toBe('/app/settings');
    expect(provider.currentHref).toBe('/app/settings');
    expect(settingsAdopt).toHaveBeenCalledTimes(1);
    expect(indexAdopt).toHaveBeenCalledTimes(1);
  });

  it('whenReady rejection is fallback without adopt', async () => {
    history.replaceState(null, '', '/about');
    const about = createDomRoute('/about');
    const adopt = jest.fn();
    Object.defineProperties(about, {
      whenReady: {
        configurable: true,
        value: async () => {
          throw new Error('setup failed');
        },
      },
      adopt: {
        configurable: true,
        value: adopt,
      },
    });

    const { engine } = createEngineHarness({
      href: '/about',
      domRoutes: [about],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const initialView = document.createElement('div');
    initialView.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    rootOutlet.append(initialView);
    document.body.append(rootOutlet);

    const result = await hydrate(initialView, engine, rootOutlet);

    expect(result).toEqual({ status: 'fallback' });
    expect(adopt).not.toHaveBeenCalled();
  });
});

describe('bootstrap SSR structure-error recovery', () => {
  beforeAll(() => {
    ensureOutletElement();
  });

  afterEach(() => {
    document.body.replaceChildren();
    history.replaceState(null, '', '/');
  });

  it('keeps SSR visible, does not initNavigate, prev stays null', async () => {
    history.replaceState(null, '', '/settings/profile');
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    stubHydrateHooks(settings);
    stubHydrateHooks(profile);

    const { engine } = createEngineHarness({
      href: '/settings/profile',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    // External SSR layout (outside appOutlet) — matches playground broken markup.
    const layoutRoot = document.createElement('div');
    layoutRoot.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    layoutRoot.textContent = 'SSR LAYOUT';
    document.body.append(layoutRoot, rootOutlet);

    const navigateSpy = jest.spyOn(engine, 'navigateTo');
    const leaf = await engine.bootstrap(layoutRoot, rootOutlet);

    expect(leaf?.pathname).toBe('/settings/profile');
    expect(engine.getCommittedRoute()).toBeNull();
    expect(layoutRoot.hidden).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('restores broken SSR when recovery navigation does not commit', async () => {
    history.replaceState(null, '', '/settings/profile');
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    stubHydrateHooks(settings);
    stubHydrateHooks(profile);

    const { engine } = createEngineHarness({
      href: '/settings/profile',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const layoutRoot = document.createElement('div');
    layoutRoot.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    layoutRoot.textContent = 'SSR LAYOUT';
    document.body.append(layoutRoot, rootOutlet);

    await engine.bootstrap(layoutRoot, rootOutlet);

    const coordinator = (engine as unknown as {
      navigationCoordinator: { navigate: (...args: unknown[]) => Promise<void> };
    }).navigationCoordinator;
    jest.spyOn(coordinator, 'navigate').mockResolvedValue(undefined);

    await engine.navigateTo('/users', 'push', { replace: false, syncHistory: true });

    expect(document.body.contains(layoutRoot)).toBe(true);
    expect(layoutRoot.hidden).toBe(false);
  });

  it('removes broken SSR after successful commitNavigation', async () => {
    history.replaceState(null, '', '/settings/profile');
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    stubHydrateHooks(settings);
    stubHydrateHooks(profile);

    const { engine } = createEngineHarness({
      href: '/settings/profile',
      domRoutes: [settings],
    });

    const rootOutlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    const layoutRoot = document.createElement('div');
    layoutRoot.setAttribute(AURA_ROUTER_SSR_ATTR, '');
    layoutRoot.textContent = 'SSR LAYOUT';
    document.body.append(layoutRoot, rootOutlet);

    await engine.bootstrap(layoutRoot, rootOutlet);
    expect(document.body.contains(layoutRoot)).toBe(true);

    jest.spyOn(engine.pulse, 'commitEnd').mockImplementation(() => {});
    engine.commitNavigation({} as NavigationTransaction);

    expect(document.body.contains(layoutRoot)).toBe(false);
  });
});

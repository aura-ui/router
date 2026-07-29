/** @jest-environment jsdom */

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { hydrate } from '../../core/hydrate/hydrate';
import { createEngineHarness } from '../_helpers/engine-harness';
import {
  createDomRedirectRoute,
  createDomRoute,
} from '../_helpers/test-route-dom';

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
    initialView.setAttribute('aura-router-initial-view', '');
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
    layoutRoot.setAttribute('aura-router-initial-view', '');
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
    layoutRoot.setAttribute('aura-router-initial-view', '');

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
    blob.setAttribute('aura-router-initial-view', '');
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
    initialView.setAttribute('aura-router-initial-view', '');
    rootOutlet.append(initialView);
    document.body.append(rootOutlet);

    await expect(hydrate(initialView, engine, rootOutlet)).resolves.toEqual({ status: 'fallback' });
  });

  it('index folder: canonicalizes trailing slash after adopt', async () => {
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
    layoutRoot.setAttribute('aura-router-initial-view', '');
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
    expect(result.leaf.pathname).toBe('/app/settings/');
    expect(result.leaf.href).toBe('/app/settings/');
    expect(provider.currentHref).toBe('/app/settings/');
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
    initialView.setAttribute('aura-router-initial-view', '');
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
    layoutRoot.setAttribute('aura-router-initial-view', '');
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
    layoutRoot.setAttribute('aura-router-initial-view', '');
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
    layoutRoot.setAttribute('aura-router-initial-view', '');
    layoutRoot.textContent = 'SSR LAYOUT';
    document.body.append(layoutRoot, rootOutlet);

    await engine.bootstrap(layoutRoot, rootOutlet);
    expect(document.body.contains(layoutRoot)).toBe(true);

    engine.commitNavigation({ hash: '' } as never);

    expect(document.body.contains(layoutRoot)).toBe(false);
  });
});

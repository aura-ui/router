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

    const leaf = await hydrate(initialView, engine, rootOutlet);

    expect(leaf?.pathname).toBe('/about');
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

    const leaf = await hydrate(layoutRoot, engine, rootOutlet);

    expect(leaf?.pathname).toBe('/settings/profile');
    expect(leaf?.chain).toHaveLength(2);
    expect(settingsAdopt).toHaveBeenCalledTimes(1);
    expect(profileAdopt).toHaveBeenCalledTimes(1);
  });

  it('tree: missing leaf data-aura-view-root aborts without adopt', async () => {
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

    const leaf = await hydrate(layoutRoot, engine, rootOutlet);

    expect(leaf).toBeNull();
    expect(settingsAdopt).not.toHaveBeenCalled();
    expect(profileAdopt).not.toHaveBeenCalled();
  });

  it('multi-segment without nested outlet aborts (no leaf-only adopt)', async () => {
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

    const leaf = await hydrate(blob, engine, rootOutlet);

    expect(leaf).toBeNull();
    expect(settingsAdopt).not.toHaveBeenCalled();
    expect(profileAdopt).not.toHaveBeenCalled();
  });

  it('redirect match returns null', async () => {
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

    await expect(hydrate(initialView, engine, rootOutlet)).resolves.toBeNull();
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

    const leaf = await hydrate(layoutRoot, engine, rootOutlet);

    expect(leaf?.pathname).toBe('/app/settings/');
    expect(leaf?.href).toBe('/app/settings/');
    expect(provider.currentHref).toBe('/app/settings/');
    expect(settingsAdopt).toHaveBeenCalledTimes(1);
    expect(indexAdopt).toHaveBeenCalledTimes(1);
  });

  it('whenReady rejection aborts without adopt', async () => {
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

    const leaf = await hydrate(initialView, engine, rootOutlet);

    expect(leaf).toBeNull();
    expect(adopt).not.toHaveBeenCalled();
  });
});

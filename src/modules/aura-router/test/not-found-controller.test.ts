import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import {
  AuraRouterNotFoundController,
  type AuraRouterNotFoundHost,
} from '../core/aura-router-not-found-controller';
import { AURA_ROUTER_NOT_FOUND, dispatchNotFound } from '../core/navigation-events';

type TestHost = HTMLElement & AuraRouterNotFoundHost;

function createHost(options: { notFoundTemplate?: string; withOutlet?: boolean } = {}): TestHost {
  const router = document.createElement('div') as TestHost;
  let outlet: AuraOutlet | null = null;

  Object.defineProperty(router, 'notFoundTemplate', {
    value: options.notFoundTemplate ?? '',
    configurable: true,
  });

  Object.defineProperty(router, 'appOutlet', {
    get: () => outlet as AuraOutlet,
    configurable: true,
  });

  document.body.appendChild(router);

  if (options.withOutlet !== false) {
    // Sibling before host — mirrors AuraRouter.appOutlet placement.
    outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    document.body.insertBefore(outlet, router);
  }

  return router;
}

describe('AuraRouterNotFoundController', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    AuraRouterNotFoundController.configure(undefined);
    document.body.replaceChildren();
  });

  it('renders default fallback text in root outlet', () => {
    const router = createHost();
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/missing');

    expect(router.appOutlet.textContent).toBe('Page not found: /missing');
    expect(router.appOutlet.children).toHaveLength(1);
  });

  it('renders not-found-template and fills data-not-found-url', () => {
    const template = document.createElement('template');
    template.id = '404-template';
    template.innerHTML = '<h1>404</h1><p><span data-not-found-url></span></p>';
    document.body.appendChild(template);

    const router = createHost({ notFoundTemplate: '404-template' });
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/gone');

    expect(router.appOutlet.querySelector('h1')?.textContent).toBe('404');
    expect(router.appOutlet.querySelector('[data-not-found-url]')?.textContent).toBe('/gone');
  });

  it('skips recovery when not-found event is prevented', () => {
    const router = createHost();
    const controller = new AuraRouterNotFoundController(router);
    const listener = jest.fn((event: Event) => event.preventDefault());

    router.addEventListener(AURA_ROUTER_NOT_FOUND, listener);
    if (dispatchNotFound(router, '/blocked', 'fallback')) {
      controller.recover('/blocked');
    }

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      url: '/blocked',
      router,
      source: 'fallback',
    });
    expect(router.appOutlet.children).toHaveLength(0);
  });

  it('uses custom handler and clears built-in fallback view', () => {
    const router = createHost();
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/first');
    expect(router.appOutlet.textContent).toBe('Page not found: /first');

    controller.setHandler(() => {
      router.appOutlet.replaceChildren(document.createTextNode('custom 404'));
    });
    controller.recover('/second');

    expect(router.appOutlet.textContent).toBe('custom 404');
  });

  it('hide() clears fallback without removing a subsequently mounted route view', () => {
    const router = createHost();
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/missing');
    expect(router.appOutlet.textContent).toBe('Page not found: /missing');

    router.appOutlet.apply('<span>home</span>', { strategy: 'replace', key: '/' });
    controller.hide();

    expect(router.appOutlet.textContent).toBe('home');
    expect(router.appOutlet.children).toHaveLength(1);
  });

  it('throws when appOutlet resolves to null', () => {
    // Defensive path for hosts that do not auto-create (AuraRouter always does).
    const router = createHost({ withOutlet: false });
    const controller = new AuraRouterNotFoundController(router);

    expect(() => controller.recover('/missing')).toThrow(
      '`<aura-router>` requires a root `<aura-outlet>` for fallback 404.',
    );
  });
});

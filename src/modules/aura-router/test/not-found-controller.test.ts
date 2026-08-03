import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import {
  AuraRouterNotFoundController,
  type AuraRouterNotFoundHost,
} from '../core/not-found-controller';

type TestHost = HTMLElement & AuraRouterNotFoundHost;

function createHost(options: { errorTemplate?: string } = {}): TestHost {
  const router = document.createElement('div') as unknown as TestHost;
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;

  Object.defineProperty(router, 'errorTemplate', {
    value: options.errorTemplate ?? '',
    configurable: true,
  });
  Object.defineProperty(router, 'appOutlet', {
    value: outlet,
    configurable: true,
  });

  document.body.append(outlet, router);
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

  it('decodes percent-encoded URLs in fallback text', () => {
    const router = createHost();
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/%D0%B0%D0%B2%D1%82%D0%BE%D1%80%D1%81%D0%BA%D0%B8%D0%B5-%D0%BF%D1%80%D0%B0%D0%B2%D0%B0.html');

    expect(router.appOutlet.textContent).toBe('Page not found: /авторские-права.html');
  });

  it('renders error-template and fills data-not-found-url', () => {
    const template = document.createElement('template');
    template.id = 'error-template';
    template.innerHTML = '<h1>404</h1><p><span data-not-found-url></span></p>';
    document.body.appendChild(template);

    const router = createHost({ errorTemplate: 'error-template' });
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/gone');

    expect(router.appOutlet.querySelector('h1')?.textContent).toBe('404');
    expect(router.appOutlet.querySelector('[data-not-found-url]')?.textContent).toBe('/gone');
  });

  it('fills data-not-found-url with a decoded path', () => {
    const template = document.createElement('template');
    template.id = 'error-template';
    template.innerHTML = '<span data-not-found-url></span>';
    document.body.appendChild(template);

    const router = createHost({ errorTemplate: 'error-template' });
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/%D0%BF%D1%83%D1%82%D1%8C.html');

    expect(router.appOutlet.querySelector('[data-not-found-url]')?.textContent).toBe('/путь.html');
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

  it('clear() drops fallback without removing a subsequently mounted route view', () => {
    const router = createHost();
    const controller = new AuraRouterNotFoundController(router);

    controller.recover('/missing');
    expect(router.appOutlet.textContent).toBe('Page not found: /missing');

    router.appOutlet.apply('<span>home</span>', { strategy: 'replace', key: '/' });
    controller.clear();

    expect(router.appOutlet.textContent).toBe('home');
    expect(router.appOutlet.children).toHaveLength(1);
  });
});

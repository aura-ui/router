/** @jest-environment jsdom */

import { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraRouter } from '../../../aura-router/core/aura-router';
import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { defaultLoaderRegistry } from '../../core/content-graph';
import { withResolvedView } from '../helpers/with-resolved-view';

function defineDemoElements(): void {
  if (!customElements.get(AuraOutlet.is)) {
    customElements.define(AuraOutlet.is, AuraOutlet);
  }
  if (!customElements.get(AuraRouter.is)) {
    customElements.define(AuraRouter.is, AuraRouter);
  }
  if (!customElements.get(AuraRoute.is)) {
    customElements.define(AuraRoute.is, AuraRoute);
  }
}

function mountRouter(html: string): AuraRouter {
  defineDemoElements();
  document.body.innerHTML = html;
  return document.querySelector(AuraRouter.is) as AuraRouter;
}

describe('view attr end-to-end', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('reads view from upgraded aura-route element', () => {
    mountRouter(`
      <aura-router>
        <aura-outlet></aura-outlet>
        <aura-route path="/b" view="url::index2.html"></aura-route>
      </aura-router>
    `);

    const route = document.querySelector(AuraRoute.is) as AuraRoute;
    expect(route.view).toEqual({ type: 'url', content: 'index2.html' });
  });

  it('loads html view via shared router contentGraph registry', async () => {
    const router = mountRouter(`
      <aura-router>
        <aura-outlet></aura-outlet>
        <aura-route path="/x" view="html::<b>hi</b>"></aura-route>
      </aura-router>
    `);

    const route = document.querySelector(AuraRoute.is) as AuraRoute;
    const payload = await router.contentGraph.resolve(
      withResolvedView({ href: '/x', pathname: '/x', search: '', hash: '', pattern: '/x', route }),
      new AbortController().signal,
    );

    expect(payload).toBe('<b>hi</b>');
  });

  it('uses custom loader registered on defaultLoaderRegistry', async () => {
    defaultLoaderRegistry.registerFn('integration-custom', async () => 'custom payload');

    const router = mountRouter(`
      <aura-router>
        <aura-outlet></aura-outlet>
        <aura-route path="/custom" view="integration-custom::any-ref"></aura-route>
      </aura-router>
    `);

    const route = document.querySelector(AuraRoute.is) as AuraRoute;
    const payload = await router.contentGraph.resolve(
      withResolvedView({
        href: '/custom',
        pathname: '/custom',
        search: '',
        hash: '',
        pattern: '/custom',
        route,
      }),
      new AbortController().signal,
    );

    expect(payload).toBe('custom payload');
  });
});

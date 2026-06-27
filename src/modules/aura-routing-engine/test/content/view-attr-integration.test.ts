/** @jest-environment jsdom */

import { AuraRoute2 } from '../../../aura-route-2/core/aura-route';
import { AuraRouter } from '../../../aura-router/core/aura-router';
import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { RouteContentLoader } from '../../../aura-route-2/core/route-content-loader';
import { contentDescriptorFromRoute } from '../../core/content/descriptor';
import { defaultLoaderRegistry } from '../../core/content';

function defineDemoElements(): void {
  if (!customElements.get(AuraOutlet.is)) {
    customElements.define(AuraOutlet.is, AuraOutlet);
  }
  if (!customElements.get(AuraRouter.is)) {
    customElements.define(AuraRouter.is, AuraRouter);
  }
  if (!customElements.get(AuraRoute2.is)) {
    customElements.define(AuraRoute2.is, AuraRoute2);
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
        <aura-route path="/b" view="html-src::index2.html"></aura-route>
      </aura-router>
    `);

    const route = document.querySelector(AuraRoute2.is) as AuraRoute2;
    expect(route.view).toBe('html-src::index2.html');
    expect(contentDescriptorFromRoute(route)).toEqual({
      kind: 'content',
      loader: 'html-src',
      ref: 'index2.html',
      cache: false,
    });
  });

  it('loads html view via shared router contentLoad registry', async () => {
    const router = mountRouter(`
      <aura-router>
        <aura-outlet></aura-outlet>
        <aura-route path="/x" view="html::<b>hi</b>"></aura-route>
      </aura-router>
    `);

    const route = document.querySelector(AuraRoute2.is) as AuraRoute2;
    const loader = new RouteContentLoader(route, router.contentLoad);
    const payload = await loader.resolve(
      { href: '/x', pathname: '/x', search: '', hash: '', pattern: '/x', route },
      new AbortController().signal,
    );

    expect(payload).toBe('<b>hi</b>');
  });

  it('uses custom loader registered on defaultLoaderRegistry', async () => {
    defaultLoaderRegistry.register('integration-custom', async () => 'custom payload');

    const router = mountRouter(`
      <aura-router>
        <aura-outlet></aura-outlet>
        <aura-route path="/custom" view="integration-custom::any-ref"></aura-route>
      </aura-router>
    `);

    const route = document.querySelector(AuraRoute2.is) as AuraRoute2;
    const loader = new RouteContentLoader(route, router.contentLoad);
    const payload = await loader.resolve(
      { href: '/custom', pathname: '/custom', search: '', hash: '', pattern: '/custom', route },
      new AbortController().signal,
    );

    expect(payload).toBe('custom payload');
  });
});

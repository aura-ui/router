/** @jest-environment jsdom */

import { AuraRouter } from '../../../aura-router/core/aura-router';
import { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';

function mountDemoRouter(): AuraRouter {
  document.body.innerHTML = `
    <template id="app">Шаблон</template>
    <template id="error-template">Ой что-то пошло не так, попробуйте позже</template>
    <aura-router error-template="error-template">
      <aura-outlet></aura-outlet>
      <aura-route path="/c" view="template::app"></aura-route>
    </aura-router>
  `;

  if (!customElements.get(AuraOutlet.is)) customElements.define(AuraOutlet.is, AuraOutlet);
  if (!customElements.get(AuraRouter.is)) customElements.define(AuraRouter.is, AuraRouter);
  if (!customElements.get(AuraRoute.is)) customElements.define(AuraRoute.is, AuraRoute);

  return document.querySelector(AuraRouter.is) as AuraRouter;
}

describe('demo render smoke', () => {
  it('renders template:app without error template', async () => {
    const router = mountDemoRouter();
    const route = document.querySelector(AuraRoute.is) as AuraRoute;

    expect(route.view).toEqual({ type: 'template', content: 'app' });

    await route.render({
      href: '/c',
      pathname: '/c',
      search: '',
      hash: '',
      pattern: '/c',
      route,
    });

    const outlet = router.appOutlet;
    const text = outlet.textContent ?? '';
    expect(text).toContain('Шаблон');
    expect(text).not.toContain('Ой что-то пошло не так');
  });
});

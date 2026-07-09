/** @jest-environment jsdom */

import { AuraRouter } from '../../../aura-router/core/aura-router';
import { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { defaultLoaderRegistry } from '../../core/content-graph';

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

function mountIndexFragment(): AuraRouter {
  defineDemoElements();

  document.body.innerHTML = `
    <template id="app">Шаблон</template>
    <template id="error-template">Ошибка</template>
    <template id="loading-template">Загрузка</template>
    <aura-router error-template="error-template" loading-template="loading-template">
      <div class="transition-outlet-wrap">
        <aura-outlet></aura-outlet>
      </div>
      <aura-route path="/c" view="template::app"></aura-route>
    </aura-router>
  `;

  defaultLoaderRegistry.register('custom-loader', async () => 'custom');

  return document.querySelector(AuraRouter.is) as AuraRouter;
}

describe('navigate /c integration', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders template app in outlet after navigate', async () => {
    const router = mountIndexFragment();
    await customElements.whenDefined(AuraRoute.is);
    await Promise.resolve();

    router.navigate('/c', { replace: true, syncHistory: false });

    await new Promise((r) => setTimeout(r, 100));

    const text = router.appOutlet.textContent ?? '';
    expect(text).toContain('Шаблон');
    expect(text).not.toContain('Ошибка');
  });
});

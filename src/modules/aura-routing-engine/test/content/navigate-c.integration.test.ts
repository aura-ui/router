/** @jest-environment jsdom */

import { AuraRouter } from '../../../aura-router/core/aura-router';
import { AuraRouterOutlet } from '../../../aura-router-outlet/core';
import { AuraRoute2 } from '../../../aura-route-2/core/aura-route';
import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { defaultLoaderRegistry } from '../../core/content/registry';

function mountIndexFragment(): AuraRouter {
  document.body.innerHTML = `
    <template id="app">Шаблон</template>
    <template id="error-template">Ошибка</template>
    <template id="loading-template">Загрузка</template>
    <aura-router error-template="error-template" loading-template="loading-template">
      <div class="transition-outlet-wrap">
        <aura-outlet></aura-outlet>
      </div>
      <aura-route path="/c" data-crossfade="" view="template::app"></aura-route>
    </aura-router>
  `;

  defaultLoaderRegistry.register('custom-loader', async () => 'custom');

  customElements.define(AuraOutlet.is, AuraOutlet);
  customElements.define(AuraRouterOutlet.is, AuraRouterOutlet);
  customElements.define(AuraRouter.is, AuraRouter);
  customElements.define(AuraRoute2.is, AuraRoute2);

  return document.querySelector(AuraRouter.is) as AuraRouter;
}

describe('navigate /c integration', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders template app in outlet after navigate', async () => {
    const router = mountIndexFragment();
    router.navigate('/c', { replace: true, syncHistory: false });

    await new Promise((r) => setTimeout(r, 100));

    const text = router.appOutlet.textContent ?? '';
    expect(text).toContain('Шаблон');
    expect(text).not.toContain('Ошибка');
  });
});

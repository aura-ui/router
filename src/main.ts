import { AURARouter } from './components/aura-router/aura-router';
import { AURARoute } from './components/aura-route/aura-route';
import { type AURARouteContentType, auraRouteLoaders } from './components/aura-route/loaders/content-loader-factory';
import { BaseLoader } from './components/aura-route/loaders/base-loader';
import { authHook, type AuthHookOptions } from './components/aura-router/plugins/auth-plugin';
import { analyticsHook } from './components/aura-router/plugins/analytics-plugin';

// import {TestElement} from './components/test-element/test-element';

class CustomLoader extends BaseLoader {
  static readonly type = 'custom-loader' as const;

  get type(): AURARouteContentType {
    return CustomLoader.type;
  }

  async load(url: string): Promise<string> {
    return 'custom loader content';
  }
}


AURARouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AURARouter.use(analyticsHook);

auraRouteLoaders.define('custom-loader', CustomLoader);

customElements.define(AURARoute.is, AURARoute);
customElements.define(AURARouter.is, AURARouter);



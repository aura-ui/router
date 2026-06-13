import { AURARouter } from './components/aura-router/aura-router';
import { AURARoute } from './components/aura-route/aura-route';
import { ContentLoaderService } from './components/aura-route/loaders/content-loader-service';
import type { AURARouteContentType } from './components/aura-route/loaders/content-loader-types';
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

AURARoute.configure({ contentLoaderService: new ContentLoaderService(false) });

AURARouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AURARouter.use(analyticsHook);

AURARoute.registerLoader('custom-loader', CustomLoader);

customElements.define(AURARoute.is, AURARoute);
customElements.define(AURARouter.is, AURARouter);



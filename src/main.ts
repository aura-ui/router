import { AURARouter } from './modules/aura-router/aura-router';
import { AURARoute } from './modules/aura-route/aura-route';
import { ContentLoaderService } from './modules/aura-route/loaders/content-loader-service';
import type { AURARouteContentType } from './modules/aura-route/loaders/content-loader-types';
import { BaseLoader } from './modules/aura-route/loaders/base-loader';
import { authHook, type AuthHookOptions } from './modules/aura-router/plugins/auth-plugin';
import { analyticsHook } from './modules/aura-router/plugins/analytics-plugin';

// import {TestElement} from './modules/test-element/test-element';

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



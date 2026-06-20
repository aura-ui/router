import { AuraRouter } from '../../modules/aura-router/core';
import { AuraRouterOutlet } from '../../modules/aura-router-outlet/core';
import { AURARoute } from '../../modules/aura-route/core';
import { ContentLoaderService } from '../../modules/aura-content-loaders/core';
import { authHook, type AuthHookOptions } from './hooks/auth.hook';
import { analyticsHook } from './hooks/analytics.hook';
import { CustomLoader } from './loaders/custom-loader';

AURARoute.configure({ contentLoaderService: new ContentLoaderService(false) });

AuraRouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AuraRouter.use(analyticsHook);

AURARoute.registerLoader('custom-loader', CustomLoader);

customElements.define(AURARoute.is, AURARoute);
customElements.define(AuraRouter.is, AuraRouter);
customElements.define(AuraRouterOutlet.is, AuraRouterOutlet);

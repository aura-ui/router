import { AuraRouter } from '../../modules/aura-router/core';
import { AuraRouterOutlet } from '../../modules/aura-router-outlet/core';
import { AuraRoute } from '../../modules/aura-route/core';
import { ContentLoaderService } from '../../modules/aura-content-loaders/core';
import { authHook, type AuthHookOptions } from './hooks/auth.hook';
import { analyticsHook } from './hooks/analytics.hook';
import { CustomLoader } from './loaders/custom-loader';
import { AuraOutlet } from '../../modules/aura-outlet/core/aura-outlet';

AuraRouter.configure({ contentLoaderService: new ContentLoaderService(false) });

AuraRouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AuraRouter.use(analyticsHook);

AuraRouter.registerLoader('custom-loader', CustomLoader);

customElements.define(AuraOutlet.is, AuraOutlet);
customElements.define(AuraRouterOutlet.is, AuraRouterOutlet);
customElements.define(AuraRoute.is, AuraRoute);
customElements.define(AuraRouter.is, AuraRouter);

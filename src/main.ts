import { AURARouter } from './modules/aura-router/core';
import { AURARoute } from './modules/aura-route/core';
import { ContentLoaderService } from './modules/aura-content-loaders/core';
import { authHook, type AuthHookOptions } from './hooks/auth.hook';
import { analyticsHook } from './hooks/analytics.hook';
import { CustomLoader } from './loaders/custom-loader';

// import {TestElement} from './modules/test-element/test-element';

AURARoute.configure({ contentLoaderService: new ContentLoaderService(false) });

AURARouter.use(authHook, { redirect: '/login' } satisfies AuthHookOptions);
AURARouter.use(analyticsHook);

AURARoute.registerLoader('custom-loader', CustomLoader);

customElements.define(AURARoute.is, AURARoute);
customElements.define(AURARouter.is, AURARouter);

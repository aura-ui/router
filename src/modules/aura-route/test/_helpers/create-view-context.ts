import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface } from '../../core/types';
import { defaultDomCache } from '../../core/view/dom-cache';
import type { MountSnapshot } from '../../core/view/outlet-adapter';
import type { RouteViewConfig } from '../../core/view/types';
import { ViewContext } from '../../core/view/view-context';

import { createRouteStub } from './create-route-stub';

export type CreateViewContextOptions = {
  root: AuraOutlet;
  route?: Partial<AuraRouteInterface>;
  view?: RouteViewConfig['view'];
  cache?: RouteViewConfig['cache'];
  plugins?: RouteViewConfig['plugins'];
  mount?: MountSnapshot;
  getPassId?: () => number;
};

/** Shared {@link ViewContext} factory for pipeline / teardown tests. */
export function createViewContext(options: CreateViewContextOptions): ViewContext {
  const ctx = new ViewContext(
    {
      route: createRouteStub(options.route),
      view: options.view ?? { loadView: async () => ({ data: null }) },
      cache: options.cache ?? defaultDomCache,
      mountTarget: {
        appOutlet: () => options.root,
        nestedOutlet: () => null,
      },
      plugins: options.plugins,
    },
    options.getPassId ?? (() => 1),
  );

  if (options.mount) {
    ctx.mount = options.mount;
  }

  return ctx;
}

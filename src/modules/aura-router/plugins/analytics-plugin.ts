function track(event: string, path: string) {
  console.log(`[Analytics] ${event}: ${path}`);
}

// hooks/analytics.hook.ts
import { defineRouteHook } from '../../aura-route-hooks/core';

export const analyticsHook = defineRouteHook({
  name: 'analytics',
  version: '1.0.0',
  fn: (ctx) => {
    track('pageview', ctx.to.path);
  },
});
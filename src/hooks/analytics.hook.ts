import { defineRouteHook } from '../modules/aura-route-hooks/core';

function track(event: string, path: string): void {
  console.log(`[Analytics] ${event}: ${path}`);
}

export const analyticsHook = defineRouteHook({
  name: 'analytics',
  version: '1.0.0',
  fn: async (ctx) => {
    track('pageview', ctx.to.path);
  },
});

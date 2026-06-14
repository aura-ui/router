function track(event: string, path: string) {
  console.log(`[Analytics] ${event}: ${path}`);
}

// hooks/analytics.hook.ts
import { defineRouteHook } from './types';

export const analyticsHook = defineRouteHook({
  name: 'analytics',
  version: '1.0.0',
  fn: (ctx) => {
    track('pageview', ctx.to.path);
  },
});
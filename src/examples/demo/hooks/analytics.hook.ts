import { defineRouteHook } from '../../../modules/aura-routing-engine/core';

function track(event: string, path: string): void {
  document.dispatchEvent(
    new CustomEvent('demo:pageview', { detail: { event, path } }),
  );
}

export const analyticsHook = defineRouteHook({
  name: 'analytics',
  version: '1.0.0',
  fn: async (ctx) => {
    track('pageview', ctx.to.pathname);
  },
});

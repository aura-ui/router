import { defineRouteHook, type RouteHookContext } from '../../../modules/aura-routing-engine/core';
import { demoAuthEnabled } from '../demo-state';

async function checkAuth(): Promise<boolean> {
  return demoAuthEnabled;
}

async function authGuard(ctx: RouteHookContext): Promise<string | void> {
  if (!await checkAuth()) {
    return (ctx.options.redirect as string) ?? '/login';
  }
}

export const authHook = defineRouteHook({
  name: 'auth',
  version: '1.0.0',
  requires: '>=0.1.0',
  fn: authGuard,
});

export type AuthHookOptions = { redirect?: string };

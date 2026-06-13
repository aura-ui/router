async function checkAuth(): Promise<boolean> {
  // Твоя логика проверки
  return false;
}

// hooks/auth.hook.ts
import { defineRouteHook, type RouteHookContext } from './types';

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
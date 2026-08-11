/** @jest-environment jsdom */

import type { RouteLoadFn } from '../../../index';
import { defaultHookRegistry } from '../../aura-routing-engine/core';
import { AuraRouter } from '../core/aura-router';

describe('AuraRouter.use', () => {
  afterEach(() => {
    AuraRouter.unuse('kiss-auth');
    AuraRouter.unuse('load-account');
  });

  it('registers name + fn', () => {
    const fn = async () => {};
    AuraRouter.use('kiss-auth', fn, { redirect: '/login' });

    expect(defaultHookRegistry.get('kiss-auth')).toMatchObject({
      fn,
      version: '1.0.0',
      options: { redirect: '/login' },
    });
  });

  it('registers a typed load hook', () => {
    const fn: RouteLoadFn<{ id: string }> = async () => ({ id: '42' });

    AuraRouter.use('load-account', fn);

    expect(defaultHookRegistry.get('load-account')?.fn).toBe(fn);
  });
});

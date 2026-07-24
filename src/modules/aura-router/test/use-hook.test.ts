/** @jest-environment jsdom */

import { defaultHookRegistry } from '../../aura-routing-engine/core';
import { AuraRouter } from '../core/aura-router';

describe('AuraRouter.use', () => {
  afterEach(() => {
    AuraRouter.unuse('kiss-auth');
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
});

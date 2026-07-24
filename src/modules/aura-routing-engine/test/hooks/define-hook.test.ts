import { defineRouteHook } from '../../core/hooks/define-hook';

describe('defineRouteHook', () => {
  it('short form builds a frozen definition', () => {
    const fn = async () => {};
    const hook = defineRouteHook('auth', fn, { version: '2.0.0', requires: '>=0.1.0' });

    expect(hook).toEqual({
      name: 'auth',
      version: '2.0.0',
      requires: '>=0.1.0',
      fn,
    });
    expect(hook.version).toBe('2.0.0');
    expect(Object.isFrozen(hook)).toBe(true);
  });

  it('short form defaults version to 1.0.0', () => {
    expect(defineRouteHook('auth', async () => {}).version).toBe('1.0.0');
  });

  it('object form freezes the definition', () => {
    const fn = async () => {};
    const hook = defineRouteHook({
      name: 'auth',
      version: '1.2.0',
      requires: '>=0.1.0',
      fn,
    });

    expect(hook).toMatchObject({ name: 'auth', version: '1.2.0', fn });
    expect(Object.isFrozen(hook)).toBe(true);
  });
});

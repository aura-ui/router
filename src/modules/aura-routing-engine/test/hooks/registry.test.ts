import { defineRouteHook } from '../../core/hooks/define-hook';
import { HookRegistry } from '../../core/hooks/registry';

describe('HookRegistry', () => {
  it('unregister removes a hook by name', () => {
    const registry = new HookRegistry();
    const hook = defineRouteHook({
      name: 'analytics',
      version: '1.0.0',
      fn: async () => {},
    });

    registry.register(hook);
    expect(registry.has('analytics')).toBe(true);

    expect(registry.unregister('analytics')).toBe(true);
    expect(registry.has('analytics')).toBe(false);
    expect(registry.unregister('analytics')).toBe(false);
  });

  it('re-registering the same hook definition updates options without version warning', () => {
    const registry = new HookRegistry();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const hook = defineRouteHook({
      name: 'auth',
      version: '1.0.0',
      fn: async () => {},
    });

    registry.register(hook, { redirect: '/login' });
    registry.register(hook, { redirect: '/sign-in' });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stores a snapshot of options so caller mutations do not affect the hook', () => {
    const registry = new HookRegistry();
    const hook = defineRouteHook({
      name: 'auth',
      version: '1.0.0',
      fn: async () => {},
    });
    const options = { redirect: '/login' };

    registry.register(hook, options);
    options.redirect = '/changed';

    expect(registry.get('auth')?.options).toEqual({ redirect: '/login' });
  });

  it('throws when hook requires a newer router version', () => {
    const registry = new HookRegistry();

    expect(() =>
      registry.register(
        defineRouteHook({
          name: 'future-hook',
          version: '1.0.0',
          requires: '>99.0.0',
          fn: async () => {},
        }),
      ),
    ).toThrow('Hook "future-hook@1.0.0" requires router >99.0.0');
  });

  it('throws on invalid hook names', () => {
    const registry = new HookRegistry();

    expect(() =>
      registry.register({
        name: 'Auth',
        version: '1.0.0',
        fn: async () => {},
      }),
    ).toThrow(/kebab-case.*lowercase/);
  });
});


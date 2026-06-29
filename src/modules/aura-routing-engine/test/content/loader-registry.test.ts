import {
  BUILTIN_LOADER_TYPES,
  LoaderRegistry,
  createBuiltinLoaders,
} from '../../core/content';

describe('LoaderRegistry', () => {
  it('exposes built-in loader types', () => {
    const registry = new LoaderRegistry();
    const types = registry.getRegisteredTypes();

    expect(types).toEqual(
      expect.arrayContaining([
        BUILTIN_LOADER_TYPES.template,
        BUILTIN_LOADER_TYPES.html,
        BUILTIN_LOADER_TYPES.htmlSrc,
        BUILTIN_LOADER_TYPES.component,
        BUILTIN_LOADER_TYPES.componentSrc,
      ]),
    );
  });

  it('has() reflects registration state', () => {
    const registry = new LoaderRegistry();

    expect(registry.has('html')).toBe(true);
    expect(registry.has('missing-loader')).toBe(false);

    registry.register('probe-loader', async () => 'ok');
    expect(registry.has('probe-loader')).toBe(true);
  });

  it('warns when overwriting an existing loader', () => {
    const registry = new LoaderRegistry();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    registry.register('html', async () => 'replacement');
    registry.register('html', async () => 'replacement-again');

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Content loader "html" is already registered — overwriting',
    );
    warn.mockRestore();
  });

  it('createBuiltinLoaders manifest lists all built-in types in order', () => {
    const entries = createBuiltinLoaders({
      fetchText: async () => '',
      resolveUrl: (path) => path,
    });

    expect(entries.map((entry) => entry.type)).toEqual([
      BUILTIN_LOADER_TYPES.template,
      BUILTIN_LOADER_TYPES.html,
      BUILTIN_LOADER_TYPES.htmlSrc,
      BUILTIN_LOADER_TYPES.component,
      BUILTIN_LOADER_TYPES.componentSrc,
    ]);
  });
});

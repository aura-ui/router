import {
  LoaderRegistry,
  BUILTIN_LOADER_TYPES,
  createBuiltinLoaders,
} from '../../core/content';

describe('LoaderRegistry', () => {
  it('exposes built-in loader types', () => {
    const registry = new LoaderRegistry();

    for (const type of BUILTIN_LOADER_TYPES) {
      expect(() => registry.get(type)).not.toThrow();
    }
  });

  it('get() throws for unknown loader types', () => {
    const registry = new LoaderRegistry();

    expect(() => registry.get('missing-loader')).toThrow(/Unknown content loader/);
    expect(() => registry.get('html-src')).toThrow(/Unknown content loader/);
  });

  it('register() adds custom loaders', () => {
    const registry = new LoaderRegistry();

    registry.register('probe-loader', async () => 'ok');
    expect(typeof registry.get('probe-loader')).toBe('function');
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

  it('createBuiltinLoaders manifest lists canonical types in order', () => {
    const entries = createBuiltinLoaders({
      fetchText: async () => '',
      resolveUrl: (path) => path,
    });

    expect(entries.map((entry) => entry.type)).toEqual([...BUILTIN_LOADER_TYPES]);
  });
});

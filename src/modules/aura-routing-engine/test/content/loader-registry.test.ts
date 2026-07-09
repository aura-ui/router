import {
  LoaderRegistry,
  BUILTIN_LOADER_TYPES,
  createLoaderRegistry,
  getBuiltinLoaderTypeIds,
  HtmlLoader,
  toViewPayload,
} from '../../core/content-graph';

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

  it('registerFn() adds custom loaders', async () => {
    const registry = new LoaderRegistry();

    registry.registerFn('probe-loader', async () => 'ok');
    const payload = await registry.get('probe-loader').load({
      ref: 'x',
      kind: 'content',
      signal: new AbortController().signal,
      route: { href: '/', pattern: '/' },
    });

    expect(toViewPayload(payload)).toBe('ok');
  });

  it('warns when overwriting an existing loader', () => {
    const registry = new LoaderRegistry(undefined, []);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    registry.registerFn('html', async () => 'replacement');
    registry.registerFn('html', async () => 'replacement-again');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Content loader "html" is already registered — overwriting',
    );
    warn.mockRestore();
  });

  it('register() adds class-based loaders', async () => {
    class ProbeLoader extends HtmlLoader {
      static readonly type = 'class-probe' as const;
      readonly type = ProbeLoader.type;

      override async load() {
        return { kind: 'html', html: '<class-probe/>' };
      }
    }

    const registry = new LoaderRegistry(undefined, []);
    registry.register(new ProbeLoader(registry.getEnvironment()));

    expect(registry.has('class-probe')).toBe(true);
    const payload = await registry.get('class-probe').load({
      ref: 'ignored',
      kind: 'content',
      signal: new AbortController().signal,
      route: { href: '/', pattern: '/' },
    });
    expect(toViewPayload(payload)).toBe('<class-probe/>');
  });

  it('built-in loader order matches BUILTIN_LOADER_TYPES', () => {
    expect(getBuiltinLoaderTypeIds()).toEqual([...BUILTIN_LOADER_TYPES]);
  });

  it('createLoaderRegistry() uses custom transport with built-ins', async () => {
    const registry = createLoaderRegistry({
      fetchText: async () => '<p>remote</p>',
      resolveUrl: (path) => path,
      isSSR: false,
    });

    const payload = await registry.get('url').load({
      ref: 'page.html',
      kind: 'content',
      signal: new AbortController().signal,
      route: { href: '/page', pattern: '/page' },
    });

    expect(toViewPayload(payload)).toBe('<p>remote</p>');
  });
});

import {
  LoaderRegistry,
  createLoaderRegistry,
} from '../../core/view-graph';
import { BUILTIN_LOADER_TYPES } from '../../../aura-route/core/attr/view-attr-parser';
import { HtmlLoader } from '../../core/view-graph/loaders/html';

describe('LoaderRegistry', () => {
  it('exposes built-in loader types', () => {
    const registry = new LoaderRegistry();

    for (const type of BUILTIN_LOADER_TYPES) {
      expect(() => registry.get(type)).not.toThrow();
    }
  });

  it('get() throws for unknown loader types', () => {
    const registry = new LoaderRegistry();

    expect(() => registry.get('missing-loader')).toThrow(/Unknown view loader/);
    expect(() => registry.get('html-src')).toThrow(/Unknown view loader/);
  });

  it('register(type, fn) adds custom loaders', async () => {
    const registry = new LoaderRegistry();

    registry.register('probe-loader', async () => 'ok');
    const payload = await registry.get('probe-loader').load({
      ref: 'x',
      kind: 'content',
      signal: new AbortController().signal,
      route: { href: '/', pattern: '/' },
    });

    expect(payload).toEqual({ kind: 'html', html: 'ok' });
  });

  it('warns when overwriting an existing loader', () => {
    const registry = new LoaderRegistry(undefined, []);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    registry.register('html', async () => 'replacement');
    registry.register('html', async () => 'replacement-again');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'View loader "html" is already registered — overwriting',
    );
    warn.mockRestore();
  });

  it('register(loader) adds class-based loaders', async () => {
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
    expect(payload).toEqual({ kind: 'html', html: '<class-probe/>' });
  });

  it('register(LoaderClass) instantiates with registry environment', async () => {
    class ClassProbeLoader extends HtmlLoader {
      static readonly type = 'class-register-probe' as const;
      readonly type = ClassProbeLoader.type;

      override async load() {
        return { kind: 'html', html: '<class-register/>' };
      }
    }

    const registry = new LoaderRegistry(undefined, []);
    registry.register(ClassProbeLoader);

    const payload = await registry.get('class-register-probe').load({
      ref: 'ignored',
      kind: 'content',
      signal: new AbortController().signal,
      route: { href: '/', pattern: '/' },
    });
    expect(payload).toEqual({ kind: 'html', html: '<class-register/>' });
  });

  it('register() rejects a bare function without type', () => {
    const registry = new LoaderRegistry(undefined, []);

    expect(() => registry.register(async () => 'x')).toThrow(/register\(type, fn\)/);
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

    expect(payload).toEqual({ kind: 'html', html: '<p>remote</p>' });
  });
});

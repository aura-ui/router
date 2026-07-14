import {
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
} from '../../core/view-graph/registry';
import { HtmlLoader } from '../../core/view-graph/loaders/html';
import { Loader } from '../../core/view-graph/loader';
import type { ViewLoaderEnv, ViewLoadContext, ViewLoadResult } from '../../core/view-graph/types';
import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';

class ProbeLoader extends Loader {
  static readonly type = 'template' as const satisfies LoaderId;

  load(_ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    return Promise.resolve({ kind: 'html', html: 'probe' });
  }
}

describe('LoaderRegistry', () => {
  it('registers built-in loader types by default', () => {
    const registry = new LoaderRegistry();
    expect(registry.has('html')).toBe(true);
    expect(registry.has('url')).toBe(true);
    expect(registry.has('template')).toBe(true);
    expect(registry.has('component')).toBe(true);
    expect(registry.has('import')).toBe(true);
    expect(registry.has('iframe')).toBe(true);
  });

  it('registers a loader instance', async () => {
    const registry = new LoaderRegistry(undefined, []);
    class InstanceLoader extends Loader {
      static readonly type = 'html' as const satisfies LoaderId;

      load(): Promise<ViewLoadResult | null> {
        return Promise.resolve({ kind: 'html', html: 'inst' });
      }
    }
    registry.register(new InstanceLoader(createBrowserEnv()));
    const result = await registry.get('html').load({
      content: 'x',
      kind: 'view',
      signal: new AbortController().signal,
      route: { href: '/x', pattern: '/x' },
    });
    expect(result).toEqual({ kind: 'html', html: 'inst' });
  });

  it('registers a loader class', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.register(ProbeLoader);
    const result = await registry.get('template').load({
      content: 'tpl',
      kind: 'layout',
      signal: new AbortController().signal,
      route: { href: '/x', pattern: '/x' },
    });
    expect(result).toEqual({ kind: 'html', html: 'probe' });
  });

  it('registers a loader function', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.register('html', async () => 'fn');
    await expect(
      registry.get('html').load({
        content: 'x',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/x', pattern: '/x' },
      }),
    ).resolves.toEqual({ kind: 'html', html: 'fn' });
  });

  it('register(id, fn) without options does not throw', () => {
    const registry = new LoaderRegistry(undefined, []);
    expect(() => registry.register('probe', async () => 'ok')).not.toThrow();
    expect(registry.get('probe').needsData).toBeFalsy();
  });

  it('register(id, fn, { needsData }) sets FnLoader.needsData', () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.register('needs-data-probe', async () => 'ok', { needsData: true });
    expect(registry.get('needs-data-probe').needsData).toBe(true);
  });

  it('warns when overwriting a registered type', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = new LoaderRegistry(undefined, [new HtmlLoader(createBrowserEnv())]);
    registry.register('html', async () => 'second');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('html'));
    warn.mockRestore();
  });

  it('throws when getting an unknown loader type', () => {
    const registry = new LoaderRegistry(undefined, []);
    expect(() => registry.get('html')).toThrow(/Unknown view loader/);
  });

  it('createLoaderRegistry returns an isolated registry', () => {
    const registry = createLoaderRegistry();
    expect(registry.has('html')).toBe(true);
    expect(registry).not.toBe(defaultLoaderRegistry);
  });

  it('throws when register(type) is called without a function', () => {
    const registry = new LoaderRegistry(undefined, []);
    expect(() => registry.register('html' as never)).toThrow(
      'register("html") requires a loader function',
    );
  });

  it('throws when register(loader, fn) receives an extra argument', () => {
    const registry = new LoaderRegistry(undefined, []);
    expect(() => registry.register(ProbeLoader, async () => 'x' as never)).toThrow(
      'register(loader) accepts a single argument',
    );
  });

  it('throws when register(class) has no static type', () => {
    class NoStaticTypeLoader extends Loader {
      load(): Promise<ViewLoadResult | null> {
        return Promise.resolve(null);
      }
    }
    const registry = new LoaderRegistry(undefined, []);
    expect(() => registry.register(NoStaticTypeLoader as never)).toThrow(
      'register(fn) is invalid — use register(loaderId, fn)',
    );
  });

  it('exposes registry environment via getEnvironment', () => {
    const env = createBrowserEnv();
    const registry = new LoaderRegistry(env, []);
    expect(registry.getEnvironment()).toBe(env);
  });
});

function createBrowserEnv(): ViewLoaderEnv {
  return {
    fetchText: async () => '',
    resolveUrl: (content) => content,
    isSSR: false,
  };
}

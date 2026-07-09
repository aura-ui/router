import {
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
} from '../../core/view-graph/registry';
import { HtmlLoader } from '../../core/view-graph/loaders/html';
import { Loader } from '../../core/view-graph/loader';
import type { ViewLoaderEnv, ViewLoadContext, ViewLoadResult } from '../../core/view-graph/types';
import type { LoaderType } from '../../../aura-route/core/attr/view-attr-parser';

class ProbeLoader extends Loader {
  static readonly type = 'template' as const satisfies LoaderType;
  readonly type = ProbeLoader.type;

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
      static readonly type = 'html' as const satisfies LoaderType;
      readonly type = InstanceLoader.type;

      load(): Promise<ViewLoadResult | null> {
        return Promise.resolve({ kind: 'html', html: 'inst' });
      }
    }
    registry.register(new InstanceLoader(createBrowserEnv()));
    const result = await registry.get('html').load({
      ref: 'x',
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
      ref: 'tpl',
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
        ref: 'x',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/x', pattern: '/x' },
      }),
    ).resolves.toEqual({ kind: 'html', html: 'fn' });
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
});

function createBrowserEnv(): ViewLoaderEnv {
  return {
    fetchText: async () => '',
    resolveUrl: (ref) => ref,
    isSSR: false,
  };
}

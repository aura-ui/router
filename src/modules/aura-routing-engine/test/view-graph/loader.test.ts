import { FnLoader, Loader } from '../../core/view-graph/loader';
import { createBrowserEnvironment } from '../../core/view-graph/environment';
import type { ViewLoadContext, ViewLoadResult } from '../../core/view-graph/types';
import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';

const env = createBrowserEnvironment();

function ctx(overrides: Partial<ViewLoadContext> = {}): ViewLoadContext {
  return {
    content: 'x',
    kind: 'view',
    signal: new AbortController().signal,
    route: { href: '/x', pattern: '/x' },
    ...overrides,
  };
}

describe('Loader', () => {
  class StaticTypeLoader extends Loader {
    static readonly type = 'probe' as const satisfies LoaderId;

    load(): Promise<ViewLoadResult | null> {
      return Promise.resolve({ kind: 'html', html: 'ok' });
    }
  }

  class MissingStaticLoader extends Loader {
    load(): Promise<ViewLoadResult | null> {
      return Promise.resolve(null);
    }
  }

  it('assigns type from static readonly type', () => {
    const loader = new StaticTypeLoader(env);
    expect(loader.type).toBe('probe');
  });

  it('throws when subclass omits static type', () => {
    expect(() => new MissingStaticLoader(env)).toThrow(/requires static readonly type/);
  });
});

describe('FnLoader', () => {
  it('assigns type from constructor override', () => {
    const loader = new FnLoader(env, 'custom', async () => 'x');
    expect(loader.type).toBe('custom');
  });

  it('maps string results to html kind', async () => {
    const loader = new FnLoader(env, 'html', async () => '<p>hi</p>');
    await expect(loader.load(ctx())).resolves.toEqual({ kind: 'html', html: '<p>hi</p>' });
  });

  it('returns null for nullish loader output', async () => {
    const loader = new FnLoader(env, 'html', async () => null);
    await expect(loader.load(ctx())).resolves.toBeNull();
  });

  it('wraps Element nodes in a DocumentFragment', async () => {
    const span = document.createElement('span');
    span.textContent = 'node';
    const loader = new FnLoader(env, 'html', async () => span);

    const result = await loader.load(ctx());
    expect(result?.kind).toBe('fragment');
    if (result?.kind === 'fragment') {
      expect(result.node).toBeInstanceOf(DocumentFragment);
      expect(result.node.firstChild).toBe(span);
    }
  });

  it('passes through DocumentFragment nodes', async () => {
    const fragment = document.createDocumentFragment();
    const loader = new FnLoader(env, 'html', async () => fragment);

    const result = await loader.load(ctx());
    expect(result).toEqual({ kind: 'fragment', node: fragment });
  });
});

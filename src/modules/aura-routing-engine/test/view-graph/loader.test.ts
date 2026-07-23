import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';
import { createBrowserEnvironment } from '../../core/view-graph/environment';
import { FnLoader, Loader } from '../../core/view-graph/loader';
import type { ViewLoadResult } from '../../core/view-graph/types';
import { asHtmlLoader } from '../_helpers/resource-graph-fixtures';
import { createViewLoadContext as ctx } from '../_helpers/view-load-context';

const env = createBrowserEnvironment();

describe('Loader', () => {
  class StaticTypeLoader extends Loader {
    static readonly type = 'probe' as const satisfies LoaderId;

    load(): Promise<ViewLoadResult | null> {
      return Promise.resolve({ kind: 'html', value: 'ok' });
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
    const loader = new FnLoader(env, 'custom', asHtmlLoader(async () => 'x'));
    expect(loader.type).toBe('custom');
  });

  it('wraps string payloads as html results', async () => {
    const loader = new FnLoader(env, 'html', asHtmlLoader(async () => '<p>hi</p>'));
    await expect(loader.load(ctx())).resolves.toEqual({ kind: 'html', value: '<p>hi</p>' });
  });

  it('passes through explicit ViewLoadResult', async () => {
    const loader = new FnLoader(env, 'markup', async () => ({
      kind: 'markup',
      value: '<x-widget></x-widget>',
    }));
    await expect(loader.load(ctx())).resolves.toEqual({
      kind: 'markup',
      value: '<x-widget></x-widget>',
    });
  });

  it('returns null for nullish loader output', async () => {
    const loader = new FnLoader(env, 'html', async () => null);
    await expect(loader.load(ctx())).resolves.toBeNull();
  });

  it('wraps Element nodes in a DocumentFragment under fragment', async () => {
    const span = document.createElement('span');
    span.textContent = 'node';
    const loader = new FnLoader(env, 'html', asHtmlLoader(async () => span));

    const result = await loader.load(ctx());
    expect(result?.kind).toBe('fragment');
    if (result?.kind === 'fragment') {
      expect(result.value).toBeInstanceOf(DocumentFragment);
      expect(result.value.firstChild).toBe(span);
    }
  });

  it('passes through DocumentFragment nodes under fragment', async () => {
    const fragment = document.createDocumentFragment();
    const loader = new FnLoader(env, 'html', asHtmlLoader(async () => fragment));

    await expect(loader.load(ctx())).resolves.toEqual({ kind: 'fragment', value: fragment });
  });
});

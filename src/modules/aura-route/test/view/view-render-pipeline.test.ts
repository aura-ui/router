import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_PRESERVE } from '../../../aura-routing-engine/core';
import type { MatchedRouteInfo } from '../../../aura-routing-engine/route-api';
import type { AuraRouteInterface } from '../../core/types';
import { ViewContext } from '../../core/view/view-context';
import { ViewRenderPipeline } from '../../core/view/view-render-pipeline';
import { defaultViewCache } from '../../core/view/view-cache';
import type { RenderPass } from '../../core/view/types';

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function renderPass(id = 1): RenderPass {
  return {
    id,
    routeInfo: {
      href: '/page',
      pathname: '/page',
      search: '',
      hash: '',
      pattern: '/page',
    } as MatchedRouteInfo,
    signal: new AbortController().signal,
    cacheKey: '/page',
    viewKind: 'view',
    useStagedMount: false,
  };
}

function createPipeline(
  root: AuraOutlet,
  overrides: {
    route?: Partial<AuraRouteInterface>;
    view?: ViewContext['config']['view'];
    cache?: ViewContext['config']['cache'];
    plugins?: ViewContext['config']['plugins'];
  } = {},
): ViewRenderPipeline {
  const ctx = new ViewContext(
    {
      route: {
        path: '/page',
        layout: '',
        view: '',
        loadingTemplate: '',
        errorTemplate: '',
        preserve: NO_PRESERVE,
        scrollPolicy: null,
        transition: { order: null, in: null, out: null },
        ...overrides.route,
      } as AuraRouteInterface,
      view: overrides.view ?? { loadView: async () => '<span>ok</span>' },
      cache: overrides.cache ?? defaultViewCache,
      mountTarget: {
        appOutlet: () => root,
        nestedOutlet: () => null,
      },
      plugins: overrides.plugins,
    },
    () => 1,
  );

  return new ViewRenderPipeline(ctx);
}

describe('ViewRenderPipeline', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolves content and returns ok', async () => {
    const root = createOutlet();
    const pipeline = createPipeline(root);

    const result = await pipeline.resolveAndMount(renderPass());

    expect(result).toEqual({ status: 'ok' });
    expect(root.textContent).toBe('ok');
  });

  it('fires loading plugin hooks when content resolves', async () => {
    const root = createOutlet();
    const onLoadingStart = jest.fn();
    const onLoadingEnd = jest.fn();
    const pipeline = createPipeline(root, {
      plugins: [{ onLoadingStart, onLoadingEnd }],
    });
    const pass = renderPass();

    await pipeline.resolveAndMount(pass);

    expect(onLoadingStart).toHaveBeenCalledWith(pass);
    expect(onLoadingEnd).toHaveBeenCalledWith(pass);
  });

  it('returns error result when resolver throws', async () => {
    const root = createOutlet();
    const pipeline = createPipeline(root, {
      route: { errorTemplate: '' },
      view: {
        loadView: async () => {
          throw new Error('load failed');
        },
      },
    });

    const result = await pipeline.resolveAndMount(renderPass());

    expect(result.status).toBe('error');
    expect(root.textContent).toContain('load failed');
  });

  it('syncBranchMount mounts pre-resolved content without calling loadView', () => {
    const root = createOutlet();
    const loadView = jest.fn(async () => '<span>from-resolve</span>');
    const onLoadingStart = jest.fn();
    const onLoadingEnd = jest.fn();
    const onContentResolved = jest.fn();
    const pipeline = createPipeline(root, {
      view: { loadView },
      plugins: [{ onLoadingStart, onLoadingEnd, onContentResolved }],
    });

    const result = pipeline.syncBranchMount({
      ...renderPass(),
      preResolvedContent: '<span>pre-resolved</span>',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(root.textContent).toBe('pre-resolved');
    expect(loadView).not.toHaveBeenCalled();
    expect(onLoadingStart).not.toHaveBeenCalled();
    expect(onLoadingEnd).not.toHaveBeenCalled();
    expect(onContentResolved).toHaveBeenCalledWith(
      expect.objectContaining({ preResolvedContent: '<span>pre-resolved</span>' }),
      '<span>pre-resolved</span>',
    );
  });

  it('syncBranchMount null mounts empty placeholder for content routes', () => {
    const root = createOutlet();
    const loadView = jest.fn();
    const pipeline = createPipeline(root, { view: { loadView } });

    pipeline.syncBranchMount({
      ...renderPass(),
      preResolvedContent: null,
    });

    expect(loadView).not.toHaveBeenCalled();
    expect(root.textContent).toBe('No content to display');
  });

  it('syncBranchMount does not use cache restore shortcuts', () => {
    const root = createOutlet();
    const cache = { extract: jest.fn(() => document.createElement('div')), stash: jest.fn() };
    const pipeline = createPipeline(root, {
      route: { preserve: { view: true, data: true } },
      cache,
    });

    const result = pipeline.syncBranchMount({
      ...renderPass(),
      preResolvedContent: '<span>from-branch</span>',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(root.textContent).toBe('from-branch');
    expect(cache.extract).not.toHaveBeenCalled();
  });
});

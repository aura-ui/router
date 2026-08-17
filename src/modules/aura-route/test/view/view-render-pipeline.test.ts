import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface } from '../../core/types';
import type { ViewContext } from '../../core/view/view-context';
import { ViewRenderPipeline } from '../../core/view/view-render-pipeline';
import {
  createOutlet,
  createRenderPass,
  createViewContext,
  defineAuraOutlet,
} from '../_helpers';

function createPipeline(
  root: AuraOutlet,
  overrides: {
    route?: Partial<AuraRouteInterface>;
    view?: ViewContext['config']['view'];
    cache?: ViewContext['config']['cache'];
    plugins?: ViewContext['config']['plugins'];
  } = {},
): ViewRenderPipeline {
  return new ViewRenderPipeline(
    createViewContext({
      root,
      route: overrides.route,
      view: overrides.view ?? { loadView: async () => ({ payload: '<span>ok</span>' }) },
      cache: overrides.cache,
      plugins: overrides.plugins,
    }),
  );
}

describe('ViewRenderPipeline', () => {
  beforeAll(() => {
    defineAuraOutlet();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolves content and returns ok', async () => {
    const root = createOutlet();
    const pipeline = createPipeline(root);

    const result = await pipeline.resolveAndMount(createRenderPass());

    expect(result).toEqual({ status: 'ok' });
    expect(root.textContent).toBe('ok');
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

    const result = await pipeline.resolveAndMount(createRenderPass());

    expect(result.status).toBe('error');
    expect(root.textContent).toContain('load failed');
  });

  it('syncBranchMount mounts pre-resolved content without calling loadView', () => {
    const root = createOutlet();
    const loadView = jest.fn(async () => ({ payload: '<span>from-resolve</span>' }));
    const onContentResolved = jest.fn();
    const pipeline = createPipeline(root, {
      view: { loadView },
      plugins: [{ onContentResolved }],
    });

    const result = pipeline.syncBranchMount({
      ...createRenderPass(),
      preResolvedView: '<span>pre-resolved</span>',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(root.textContent).toBe('pre-resolved');
    expect(loadView).not.toHaveBeenCalled();
    expect(onContentResolved).toHaveBeenCalledWith(
      expect.objectContaining({ preResolvedView: '<span>pre-resolved</span>' }),
      '<span>pre-resolved</span>',
    );
  });

  it('syncBranchMount null mounts empty placeholder for content routes', () => {
    const root = createOutlet();
    const loadView = jest.fn();
    const pipeline = createPipeline(root, { view: { loadView } });

    pipeline.syncBranchMount({
      ...createRenderPass(),
      preResolvedView: null,
    });

    expect(loadView).not.toHaveBeenCalled();
    expect(root.textContent).toBe('No content to display');
  });

  it('syncBranchMount restores DomCache hit before applying pre-resolved content', () => {
    const root = createOutlet();
    const cached = document.createElement('div');
    cached.textContent = 'from-dom-cache';
    const cache = { has: jest.fn(() => false), extract: jest.fn(() => cached), put: jest.fn() };
    const pipeline = createPipeline(root, {
      route: { cache: { dom: true, view: true, data: true } },
      cache,
    });

    const result = pipeline.syncBranchMount({
      ...createRenderPass(),
      preResolvedView: '<span>from-branch</span>',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(cache.extract).toHaveBeenCalled();
    expect(root.textContent).toBe('from-dom-cache');
  });

  it('syncBranchMount applies pre-resolved content when DomCache misses', () => {
    const root = createOutlet();
    const cache = { has: jest.fn(() => false), extract: jest.fn(() => undefined), put: jest.fn() };
    const pipeline = createPipeline(root, {
      route: { cache: { dom: true, view: true, data: true } },
      cache,
    });

    const result = pipeline.syncBranchMount({
      ...createRenderPass(),
      preResolvedView: '<span>from-branch</span>',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(cache.extract).toHaveBeenCalled();
    expect(root.textContent).toBe('from-branch');
  });
});

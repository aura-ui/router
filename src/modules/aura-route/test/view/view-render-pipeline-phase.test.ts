import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_CACHE } from '../../../aura-routing-engine/core';
import type { MatchedRouteInfo } from '../../../aura-routing-engine/route-api';
import type { AuraRouteInterface } from '../../core/types';
import { ViewContext } from '../../core/view/view-context';
import { ViewRenderPipelinePhase } from '../../core/view/view-render-pipeline-phase';
import { defaultDomCache } from '../../core/view/dom-cache';

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function renderPass(id = 1): import('../../core/view/types').RenderPass {
  return {
    id,
    routeInfo: {
      href: '/err',
      pathname: '/err',
      search: '',
      hash: '',
      pattern: '/err',
    } as MatchedRouteInfo,
    signal: new AbortController().signal,
    domCacheKey: '/err',
    viewKind: 'view',
    useStagedMount: false,
  };
}

function createPhase(
  root: AuraOutlet,
  route: Partial<AuraRouteInterface>,
  passId = 1,
): ViewRenderPipelinePhase {
  const ctx = new ViewContext(
    {
      route: {
        path: '/err',
        layout: '',
        view: '',
        loadingTemplate: '',
        errorTemplate: '',
        cache: NO_CACHE,
        scrollPolicy: null,
        transition: { order: null, in: null, out: null },
        ...route,
      } as AuraRouteInterface,
      view: { loadView: async () => ({ data: null }) },
      cache: defaultDomCache,
      mountTarget: {
        appOutlet: () => root,
        nestedOutlet: () => null,
      },
    },
    () => passId,
  );

  return new ViewRenderPipelinePhase(ctx);
}

describe('ViewRenderPipelinePhase', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('handleError', () => {
    it('uses errorTemplate when present', () => {
      const template = document.createElement('template');
      template.id = 'route-error-tpl';
      template.innerHTML = '<p>Oops</p>';
      document.body.append(template);

      const root = createOutlet();
      const phase = createPhase(root, { errorTemplate: 'route-error-tpl' });

      phase.handleError(renderPass(), new Error('fail'));

      expect(root.textContent).toBe('Oops');
    });

    it('falls back to HTML error panel', () => {
      const root = createOutlet();
      const phase = createPhase(root, { errorTemplate: '' });

      phase.handleError(renderPass(), new Error('boom'));

      expect(root.textContent).toContain('Content Loading Error');
      expect(root.textContent).toContain('boom');
    });
  });

  describe('resolveContent', () => {
    it('mounts empty placeholder when resolver returns null for content route', async () => {
      const root = createOutlet();
      const phase = createPhase(root, {});

      await phase.resolveContent(renderPass());

      expect(root.textContent).toBe('No content to display');
    });
  });

  describe('applyResolvedContent', () => {
    it('mounts payload without resolve', () => {
      const root = createOutlet();
      const phase = createPhase(root, {});

      phase.applyResolvedContent(renderPass(), '<span>ready</span>');

      expect(root.textContent).toBe('ready');
    });

    it('mounts empty placeholder when payload is null', () => {
      const root = createOutlet();
      const phase = createPhase(root, {});

      phase.applyResolvedContent(renderPass(), null);

      expect(root.textContent).toBe('No content to display');
    });
  });
});

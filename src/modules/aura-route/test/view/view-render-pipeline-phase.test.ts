import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface } from '../../core/types';
import { ViewRenderPipelinePhase } from '../../core/view/view-render-pipeline-phase';
import {
  createOutlet,
  createRenderPass,
  createViewContext,
  defineAuraOutlet,
} from '../_helpers';

function createPhase(
  root: AuraOutlet,
  route: Partial<AuraRouteInterface>,
  passId = 1,
): ViewRenderPipelinePhase {
  return new ViewRenderPipelinePhase(
    createViewContext({
      root,
      route: { path: '/err', ...route },
      getPassId: () => passId,
    }),
  );
}

function errPass(id = 1) {
  return createRenderPass({ id, pathname: '/err' });
}

describe('ViewRenderPipelinePhase', () => {
  beforeAll(() => {
    defineAuraOutlet();
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

      phase.handleError(errPass(), new Error('fail'));

      expect(root.textContent).toBe('Oops');
    });

    it('falls back to HTML error panel', () => {
      const root = createOutlet();
      const phase = createPhase(root, { errorTemplate: '' });

      phase.handleError(errPass(), new Error('boom'));

      expect(root.textContent).toContain('Content Loading Error');
      expect(root.textContent).toContain('boom');
    });
  });

  describe('resolveContent', () => {
    it('mounts empty placeholder when resolver returns null for content route', async () => {
      const root = createOutlet();
      const phase = createPhase(root, {});

      await phase.resolveContent(errPass());

      expect(root.textContent).toBe('No content to display');
    });
  });

  describe('applyResolvedContent', () => {
    it('mounts payload without resolve', () => {
      const root = createOutlet();
      const phase = createPhase(root, {});

      phase.applyResolvedContent(errPass(), '<span>ready</span>');

      expect(root.textContent).toBe('ready');
    });

    it('mounts empty placeholder when payload is null', () => {
      const root = createOutlet();
      const phase = createPhase(root, {});

      phase.applyResolvedContent(errPass(), null);

      expect(root.textContent).toBe('No content to display');
    });
  });
});

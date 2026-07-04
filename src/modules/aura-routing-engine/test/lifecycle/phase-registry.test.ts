import { PHASES, PIPELINE_PHASES } from '../../core/lifecycle';

describe('PHASES', () => {
  it.each(PIPELINE_PHASES)('phase %s has pipeline route callback', (phase) => {
    expect(PHASES[phase].runRouteLifecycle).toEqual(expect.any(Function));
  });

  it.each(PIPELINE_PHASES)('phase %s exposes hook and branch policy', (phase) => {
    const phaseDef = PHASES[phase];

    expect(phaseDef.phase).toBe(phase);
    expect(phaseDef.targetRoutes).toMatch(/Routes$/);
    expect(phaseDef.hookPolicy).toMatchObject({ kind: expect.stringMatching(/blocking|postCommit/) });
    expect(phaseDef.errorPolicy).toMatch(/failure|log|propagate/);
  });

  it('error phase is terminal recovery and excluded from the happy-path pipeline', () => {
    expect(PHASES.error.runRouteLifecycle).toEqual(expect.any(Function));
    expect(PHASES.error.phase).toBe('error');
    expect(PHASES.error.routeHookProp).toBe('error');
  });

  it('reenter and left expose route hook attrs', () => {
    expect(PHASES.reenter.routeHookProp).toBe('reenter');
    expect(PHASES.left.routeHookProp).toBe('left');
    expect(PHASES.reenter.htmlAttr).toBe('reenter');
    expect(PHASES.left.htmlAttr).toBe('left');
  });

  it('PIPELINE_PHASES excludes error', () => {
    expect(PIPELINE_PHASES).not.toContain('error');
    expect(PIPELINE_PHASES).toHaveLength(8);
  });
});

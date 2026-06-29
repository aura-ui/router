import { PHASES, PIPELINE_PHASES } from '../../core/lifecycle/phase-registry';

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

  it('error phase is route-only and has no pipeline callback', () => {
    expect(PHASES.error.runRouteLifecycle).toBeUndefined();
    expect(PHASES.error.phase).toBe('error');
    expect(PHASES.error.routeHookProp).toBe('error');
  });

  it('PIPELINE_PHASES excludes error', () => {
    expect(PIPELINE_PHASES).not.toContain('error');
    expect(PIPELINE_PHASES).toHaveLength(8);
  });
});

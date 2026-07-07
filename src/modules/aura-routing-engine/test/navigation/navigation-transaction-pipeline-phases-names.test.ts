import { PHASES, PIPELINE_PHASES } from '../../core/navigation/navigation-transaction-pipeline-phases-names';

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

  it('update and unmount expose route hook attrs', () => {
    expect(PHASES.update.routeHookProp).toBe('update');
    expect(PHASES.unmount.routeHookProp).toBe('unmount');
    expect(PHASES.update.htmlAttr).toBe('update');
    expect(PHASES.unmount.htmlAttr).toBe('unmount');
  });

  it('PIPELINE_PHASES excludes error', () => {
    expect(PIPELINE_PHASES).not.toContain('error');
    expect(PIPELINE_PHASES).toHaveLength(8);
  });
});

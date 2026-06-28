import { LIFECYCLE_PHASES, PHASES } from '../../core/lifecycle/phase-registry';

describe('PHASES', () => {
  it.each(LIFECYCLE_PHASES)('phase %s has pipeline route callback', (phase) => {
    expect(PHASES[phase].onRoute).toEqual(expect.any(Function));
  });

  it.each(LIFECYCLE_PHASES)('phase %s exposes hook and branch policy', (phase) => {
    const phaseDef = PHASES[phase];

    expect(phaseDef.lifecyclePhase).toBe(phase);
    expect(phaseDef.branch).toMatch(/Routes$/);
    expect(phaseDef.hooks).toMatchObject({ kind: expect.stringMatching(/blocking|postCommit/) });
    expect(phaseDef.onThrow).toMatch(/failure|log|propagate/);
  });

  it('error phase is route-only and has no pipeline callback', () => {
    expect(PHASES.error.onRoute).toBeUndefined();
    expect(PHASES.error.lifecyclePhase).toBe('error');
    expect(PHASES.error.routeProp).toBe('error');
  });

  it('LIFECYCLE_PHASES excludes error', () => {
    expect(LIFECYCLE_PHASES).not.toContain('error');
    expect(LIFECYCLE_PHASES).toHaveLength(8);
  });
});

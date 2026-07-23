/** Factory for `jest.mock('../../core/hooks/registry', …)` in navigation tests. */
export function mockHooksRegistry(): typeof import('../../../core/hooks/registry') {
  return {
    ...jest.requireActual('../../../core/hooks/registry'),
    runPhaseHooks: jest.fn(),
  };
}

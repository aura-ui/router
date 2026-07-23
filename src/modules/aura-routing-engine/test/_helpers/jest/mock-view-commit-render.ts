/** Factory for `jest.mock('../../core/view-mount/view-commit-render', …)` in navigation tests. */
export function mockViewCommitRender(): typeof import('../../../core/view-mount/view-commit-render') {
  return {
    ...jest.requireActual('../../../core/view-mount/view-commit-render'),
    runViewCommit: jest.fn(),
  };
}

import {
  buildExitRoutes,
  buildEnterRoutes,
  findBranchLcaIndex,
  findLcaNodes,
} from '../../core/route-tree/branch-diff';
import { createMatchedBranch } from '../_helpers/route-tree-fixtures';

describe('branch-diff', () => {
  it('findBranchLcaIndex compares chains by shared prefix', () => {
    const from = createMatchedBranch(['/settings', '/settings/profile']).matches;
    const to = createMatchedBranch(['/settings', '/settings/security']).matches;

    expect(findBranchLcaIndex(from, to)).toBe(0);
    expect(buildExitRoutes(from, 0).map((info) => info.pattern)).toEqual(['/settings/profile']);
    expect(buildEnterRoutes(to, 0).map((info) => info.pattern)).toEqual(['/settings/security']);
  });

  it('findBranchLcaIndex returns -1 for unrelated branches', () => {
    const from = createMatchedBranch(['/settings', '/settings/profile']).matches;
    const to = createMatchedBranch(['/']).matches;

    expect(findBranchLcaIndex(from, to)).toBe(-1);
  });

  it('findLcaNodes walks parent pointers without allocations', () => {
    const chain = createMatchedBranch([
      '/settings',
      '/settings/profile',
      '/settings/profile/edit',
    ]).matches;
    const settings = chain[0]!.node!;
    const profile = chain[1]!.node!;
    const edit = chain[2]!.node!;

    expect(findLcaNodes(profile, edit)).toBe(profile);
    expect(findLcaNodes(edit, profile)).toBe(profile);
    expect(findLcaNodes(settings, edit)).toBe(settings);
  });
});

import { toActiveRouteBranch } from '../../core/link-active/active-route-branch';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

describe('toActiveRouteBranch', () => {
  it('maps chain matches to pattern/href entries', () => {
    const parent = createMatchedRoute('/app/settings');
    const leaf = createMatchedRoute('/app/settings/profile');
    leaf.chain = [parent, leaf];
    parent.chain = leaf.chain;

    expect(toActiveRouteBranch(leaf.chain)).toEqual([
      { pattern: '/app/settings', href: '/app/settings' },
      { pattern: '/app/settings/profile', href: '/app/settings/profile' },
    ]);
  });
});

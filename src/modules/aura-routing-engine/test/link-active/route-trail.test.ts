import { toRouteTrail } from '../../core/link-active/route-trail';
import { createMatchedRoute } from '../helpers/create-mock-transaction';

describe('toRouteTrail', () => {
  it('maps active chain from a leaf match', () => {
    const parent = createMatchedRoute('/app/settings');
    const leaf = createMatchedRoute('/app/settings/profile');
    leaf.chain = [parent, leaf];
    parent.chain = leaf.chain;

    expect(toRouteTrail(leaf.chain)).toEqual([
      { pattern: '/app/settings', href: '/app/settings' },
      { pattern: '/app/settings/profile', href: '/app/settings/profile' },
    ]);
  });

  it('maps an explicit chain array', () => {
    const parent = createMatchedRoute('/app/settings');
    const leaf = createMatchedRoute('/app/settings/profile');
    leaf.chain = [parent, leaf];
    parent.chain = leaf.chain;

    expect(toRouteTrail([parent, leaf])).toEqual([
      { pattern: '/app/settings', href: '/app/settings' },
      { pattern: '/app/settings/profile', href: '/app/settings/profile' },
    ]);
  });
});

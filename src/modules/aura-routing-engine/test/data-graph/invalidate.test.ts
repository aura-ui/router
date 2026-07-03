import { resolveDataInvalidatePredicate } from '../../core/data-graph/invalidate';

describe('resolveDataInvalidatePredicate', () => {
  it('returns null when no filter is given', () => {
    expect(resolveDataInvalidatePredicate()).toBeNull();
    expect(resolveDataInvalidatePredicate({})).toBeNull();
  });

  it('matches an exact key', () => {
    const match = resolveDataInvalidatePredicate({ key: '/users|fetch' })!;
    expect(match('/users|fetch')).toBe(true);
    expect(match('/users|fetch|a=1')).toBe(false);
  });

  it('matches a path prefix before hook suffix', () => {
    const match = resolveDataInvalidatePredicate({ path: '/users' })!;
    expect(match('/users')).toBe(true);
    expect(match('/users|fetch-user')).toBe(true);
    expect(match('/users|fetch-user|id=1')).toBe(true);
    expect(match('/users-extra|fetch')).toBe(false);
  });
});

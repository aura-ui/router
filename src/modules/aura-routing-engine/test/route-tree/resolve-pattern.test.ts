import { resolvePattern } from '../../core/route-tree/resolve-pattern';

describe('resolvePattern', () => {
  it('treats absolute child as root-relative', () => {
    expect(resolvePattern('/settings', '/settings/profile')).toBe('/settings/profile');
  });

  it('joins relative child to parent pattern', () => {
    expect(resolvePattern('/settings', 'profile')).toBe('/settings/profile');
    expect(resolvePattern('/settings', 'security')).toBe('/settings/security');
  });

  it('resolves root-relative segment', () => {
    expect(resolvePattern(null, 'users')).toBe('/users');
    expect(resolvePattern(null, '/users')).toBe('/users');
  });

  it('resolves index child', () => {
    expect(resolvePattern('/settings', '')).toBe('/settings');
    expect(resolvePattern('/settings', '.')).toBe('/settings');
  });

  it('resolves global catch-all', () => {
    expect(resolvePattern(null, '*')).toBe('*');
    expect(resolvePattern(null, '/*')).toBe('*');
    expect(resolvePattern('/', '*')).toBe('*');
  });

  it('resolves scoped catch-all', () => {
    expect(resolvePattern('/users', '*')).toBe('/users/*');
    expect(resolvePattern('/settings', '/*')).toBe('/settings/*');
    expect(resolvePattern('/settings/', '*')).toBe('/settings/*');
  });

  it('normalizes trailing slashes', () => {
    expect(resolvePattern('/settings/', 'profile')).toBe('/settings/profile');
  });
});

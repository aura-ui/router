import { resolveFullPath } from '../../core/nodes-tree/resolve-full-path';

describe('resolveFullPath', () => {
  it('resolves absolute child path without parent prefix', () => {
    expect(resolveFullPath('/settings', '/settings/profile')).toBe('/settings/profile');
  });

  it('joins relative child to parent fullPath', () => {
    expect(resolveFullPath('/settings', 'profile')).toBe('/settings/profile');
    expect(resolveFullPath('/settings', 'security')).toBe('/settings/security');
  });

  it('resolves root-relative routePath', () => {
    expect(resolveFullPath(null, 'users')).toBe('/users');
    expect(resolveFullPath(null, '/users')).toBe('/users');
  });

  it('maps index child to parent URL', () => {
    expect(resolveFullPath('/settings', '')).toBe('/settings');
  });

  it('resolves global catch-all at root', () => {
    expect(resolveFullPath(null, '*')).toBe('*');
    expect(resolveFullPath(null, '/*')).toBe('*');
    expect(resolveFullPath('/', '*')).toBe('*');
  });

  it('scopes nested catch-all under parent prefix', () => {
    expect(resolveFullPath('/users', '*')).toBe('/users/*');
    expect(resolveFullPath('/settings', '/*')).toBe('/settings/*');
    expect(resolveFullPath('/settings/', '*')).toBe('/settings/*');
  });

  it('normalizes duplicate slashes', () => {
    expect(resolveFullPath('/settings/', 'profile')).toBe('/settings/profile');
  });
});

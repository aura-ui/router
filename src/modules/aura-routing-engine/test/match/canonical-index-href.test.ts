import { applyCanonicalIndexFolderHref } from '../../core/match/canonical-index-href';
import { buildTreeFromDom, createDomRoute } from '../_helpers/test-route-dom';

describe('canonical index folder href', () => {
  it('adds trailing slash for index child under folder', () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const indexNode = buildTreeFromDom(settings).nodesByPattern.get('/app/settings')!;

    expect(indexNode.isIndex).toBe(true);
    expect(applyCanonicalIndexFolderHref('/app/settings', '', '', indexNode)).toEqual({
      pathname: '/app/settings/',
      href: '/app/settings/',
    });
  });

  it('leaves leaf pathname unchanged', () => {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/app/settings', [profile]);
    const profileNode = buildTreeFromDom(settings).nodesByPattern.get('/app/settings/profile')!;

    expect(applyCanonicalIndexFolderHref('/app/settings/profile', '', '', profileNode)).toEqual({
      pathname: '/app/settings/profile',
      href: '/app/settings/profile',
    });
  });

  it('does not add slash to root index', () => {
    const index = createDomRoute('.');
    const indexNode = buildTreeFromDom(index).nodesByPattern.get('/')!;

    expect(applyCanonicalIndexFolderHref('/', '', '', indexNode)).toEqual({
      pathname: '/',
      href: '/',
    });
  });

  it('keeps existing trailing slash', () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const indexNode = buildTreeFromDom(settings).nodesByPattern.get('/app/settings')!;

    expect(applyCanonicalIndexFolderHref('/app/settings/', '', '', indexNode).href).toBe(
      '/app/settings/',
    );
  });
});

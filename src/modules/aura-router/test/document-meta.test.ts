/** @jest-environment jsdom */

import { AuraRoute } from '../../aura-route/core/aura-route';

type ApplyDocumentMeta = typeof import('../core/document-meta').applyDocumentMeta;
type PreviewDocumentTitle = typeof import('../core/document-meta').previewDocumentTitle;
type ConfirmDocumentTitle = typeof import('../core/document-meta').confirmDocumentTitle;
type RollbackDocumentTitle = typeof import('../core/document-meta').rollbackDocumentTitle;

let applyDocumentMeta: ApplyDocumentMeta;
let previewDocumentTitle: PreviewDocumentTitle;
let confirmDocumentTitle: ConfirmDocumentTitle;
let rollbackDocumentTitle: RollbackDocumentTitle;

function matchedRoute(
  path: string,
  attrs: {
    metaTitle?: string;
    metaDescription?: string;
    metaCanonical?: string;
    params?: Record<string, string>;
  } = {},
) {
  if (!customElements.get(AuraRoute.is)) {
    customElements.define(AuraRoute.is, AuraRoute);
  }
  const route = document.createElement(AuraRoute.is) as AuraRoute;
  route.setAttribute('path', path);
  if (attrs.metaTitle) route.setAttribute('meta-title', attrs.metaTitle);
  if (attrs.metaDescription) route.setAttribute('meta-description', attrs.metaDescription);
  if (attrs.metaCanonical) route.setAttribute('meta-canonical', attrs.metaCanonical);

  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route,
    params: attrs.params,
    viewKey: `view:${path}`,
  };
}

describe('applyDocumentMeta', () => {
  beforeEach(() => {
    jest.resetModules();
    ({
      applyDocumentMeta,
      previewDocumentTitle,
      confirmDocumentTitle,
      rollbackDocumentTitle,
    } = require('../core/document-meta'));
  });

  afterEach(() => {
    document.title = '';
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
    document.head.replaceChildren();
    document.body.replaceChildren();
    require('../../aura-routing-engine/core/document').configureDocumentMeta();
  });

  it('writes document.title and creates description meta', () => {
    applyDocumentMeta(
      matchedRoute('/users/:id', {
        metaTitle: 'User :id',
        metaDescription: 'Hello :id',
        params: { id: '7' },
      }),
    );

    expect(document.title).toBe('User 7');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Hello 7',
    );
  });

  it('writes canonical from htmlMeta even without description', () => {
    applyDocumentMeta(matchedRoute('/about'), {
      title: 'About',
      tags: { 'link:rel:canonical': 'https://example.com/about' },
    });

    expect(document.title).toBe('About');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://example.com/about',
    );
    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('leaves title and unmarked boot tags when there is nothing to apply', () => {
    document.title = 'Keep';
    const boot = document.head.appendChild(document.createElement('meta'));
    boot.setAttribute('name', 'description');
    boot.setAttribute('content', 'Site');

    applyDocumentMeta(matchedRoute('/x'));

    expect(document.title).toBe('Keep');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Site');
  });

  it('restores boot title when the next resolve omits it', () => {
    document.title = 'Shell';
    applyDocumentMeta(matchedRoute('/a', { metaTitle: 'A' }));
    applyDocumentMeta(matchedRoute('/b'));

    expect(document.title).toBe('Shell');
  });

  it('removes owned description and canonical when the next resolve omits them', () => {
    applyDocumentMeta(matchedRoute('/a', { metaTitle: 'A', metaDescription: 'About' }), {
      tags: { 'link:rel:canonical': 'https://example.com/a' },
    });
    applyDocumentMeta(matchedRoute('/b'));

    expect(document.querySelector('meta[name="description"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('takes over a boot description and removes it on the next omit', () => {
    const boot = document.head.appendChild(document.createElement('meta'));
    boot.setAttribute('name', 'description');
    boot.setAttribute('content', 'Site');

    applyDocumentMeta(matchedRoute('/about', { metaDescription: 'About' }));
    applyDocumentMeta(matchedRoute('/empty'));

    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('writes canonical from meta-canonical attr', () => {
    applyDocumentMeta(
      matchedRoute('/users/:id', {
        metaCanonical: 'https://example.com/users/:id',
        params: { id: '7' },
      }),
    );

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://example.com/users/7',
    );
  });

  it('writes and restores boot lang and dir from htmlMeta', () => {
    document.documentElement.setAttribute('lang', 'en');
    applyDocumentMeta(matchedRoute('/de'), { lang: 'de', dir: 'rtl' });
    expect(document.documentElement.getAttribute('lang')).toBe('de');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');

    applyDocumentMeta(matchedRoute('/empty'));
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
  });

  it('writes and reverts open graph tags from htmlMeta', () => {
    applyDocumentMeta(matchedRoute('/a'), { tags: { 'meta:property:og:title': 'Share A' } });
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Share A');

    applyDocumentMeta(matchedRoute('/b'));
    expect(document.querySelector('meta[property="og:title"]')).toBeNull();
  });

  it('applies tags registered via AuraRouter.configure', () => {
    const { AuraRouter } = require('../core/aura-router');
    AuraRouter.configure({
      documentMeta: { tags: [{ tag: 'meta', attrs: { name: 'theme-color' } }] },
    });

    applyDocumentMeta(matchedRoute('/a'), { tags: { 'meta:name:theme-color': '#111' } });
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#111');
  });

  it('previews title and rolls back on matching cancel id', () => {
    document.title = 'Shell';
    previewDocumentTitle(10, matchedRoute('/a', { metaTitle: 'A' }));
    expect(document.title).toBe('A');

    rollbackDocumentTitle(10);
    expect(document.title).toBe('Shell');
  });

  it('does not rollback preview for a different navigation id', () => {
    document.title = 'Shell';
    previewDocumentTitle(10, matchedRoute('/a', { metaTitle: 'A' }));
    rollbackDocumentTitle(11);
    expect(document.title).toBe('A');
  });

  it('keeps title when preview is confirmed', () => {
    document.title = 'Shell';
    previewDocumentTitle(10, matchedRoute('/a', { metaTitle: 'A' }));
    confirmDocumentTitle(10);
    rollbackDocumentTitle(10);
    expect(document.title).toBe('A');
  });

  it('ignores preview when route does not resolve explicit title', () => {
    document.title = 'Shell';
    previewDocumentTitle(10, matchedRoute('/a'));
    expect(document.title).toBe('Shell');
  });

  it('restores stable title after overlapping previews are cancelled', () => {
    document.title = 'Shell';
    previewDocumentTitle(1, matchedRoute('/slow', { metaTitle: 'Slow' }));
    previewDocumentTitle(2, matchedRoute('/about', { metaTitle: 'About' }));
    expect(document.title).toBe('About');

    rollbackDocumentTitle(2);
    expect(document.title).toBe('Slow');

    rollbackDocumentTitle(1);
    expect(document.title).toBe('Shell');
  });
});

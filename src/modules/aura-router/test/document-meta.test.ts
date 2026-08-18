/** @jest-environment jsdom */

import { AuraRoute } from '../../aura-route/core/aura-route';
import { resolveDocumentMetaWithParams, type DocumentMetaValues } from '../../aura-routing-engine/core/document';

type ApplyDocumentMeta = typeof import('../core/document-meta').applyDocumentMeta;
type OptimisticDocumentMeta = import('../core/document-meta-optimistic').OptimisticDocumentMeta;

let applyDocumentMeta: ApplyDocumentMeta;
let optimisticMeta: OptimisticDocumentMeta;

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

function applyRouteMeta(to: ReturnType<typeof matchedRoute>, htmlMeta?: DocumentMetaValues): void {
  applyDocumentMeta(resolveDocumentMetaWithParams(to, htmlMeta));
}

describe('applyDocumentMeta', () => {
  beforeEach(() => {
    jest.resetModules();
    applyDocumentMeta = require('../core/document-meta').applyDocumentMeta;
    const { OptimisticDocumentMeta } = require('../core/document-meta-optimistic');
    optimisticMeta = new OptimisticDocumentMeta();
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
    applyRouteMeta(
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
    applyRouteMeta(matchedRoute('/about'), {
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

    applyRouteMeta(matchedRoute('/x'));

    expect(document.title).toBe('Keep');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Site');
  });

  it('restores boot title when the next resolve omits it', () => {
    document.title = 'Shell';
    applyRouteMeta(matchedRoute('/a', { metaTitle: 'A' }));
    applyRouteMeta(matchedRoute('/b'));

    expect(document.title).toBe('Shell');
  });

  it('removes owned description and canonical when the next resolve omits them', () => {
    applyRouteMeta(matchedRoute('/a', { metaTitle: 'A', metaDescription: 'About' }), {
      tags: { 'link:rel:canonical': 'https://example.com/a' },
    });
    applyRouteMeta(matchedRoute('/b'));

    expect(document.querySelector('meta[name="description"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('takes over a boot description and removes it on the next omit', () => {
    const boot = document.head.appendChild(document.createElement('meta'));
    boot.setAttribute('name', 'description');
    boot.setAttribute('content', 'Site');

    applyRouteMeta(matchedRoute('/about', { metaDescription: 'About' }));
    applyRouteMeta(matchedRoute('/empty'));

    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('writes canonical from meta-canonical attr', () => {
    applyRouteMeta(
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
    applyRouteMeta(matchedRoute('/de'), { lang: 'de', dir: 'rtl' });
    expect(document.documentElement.getAttribute('lang')).toBe('de');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');

    applyRouteMeta(matchedRoute('/empty'));
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
  });

  it('writes and reverts open graph tags from htmlMeta', () => {
    applyRouteMeta(matchedRoute('/a'), { tags: { 'meta:property:og:title': 'Share A' } });
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Share A');

    applyRouteMeta(matchedRoute('/b'));
    expect(document.querySelector('meta[property="og:title"]')).toBeNull();
  });

  it('applies tags registered via AuraRouter.configure', () => {
    const { AuraRouter } = require('../core/aura-router');
    AuraRouter.configure({
      documentMeta: { tags: [{ tag: 'meta', attrs: { name: 'theme-color' } }] },
    });

    applyRouteMeta(matchedRoute('/a'), { tags: { 'meta:name:theme-color': '#111' } });
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#111');
  });

  it('previews title and rolls back on matching cancel id', () => {
    document.title = 'Shell';
    optimisticMeta.preview(10, matchedRoute('/a', { metaTitle: 'A' }));
    expect(document.title).toBe('A');

    optimisticMeta.rollback(10);
    expect(document.title).toBe('Shell');
  });

  it('does not rollback preview for a different navigation id', () => {
    document.title = 'Shell';
    optimisticMeta.preview(10, matchedRoute('/a', { metaTitle: 'A' }));
    optimisticMeta.rollback(11);
    expect(document.title).toBe('A');
  });

  it('keeps boot title when preview runs before the first apply', () => {
    document.title = 'Shell';
    const to = matchedRoute('/a', { metaTitle: 'A' });
    optimisticMeta.preview(1, to);
    applyRouteMeta(to);
    optimisticMeta.clear(1);
    applyRouteMeta(matchedRoute('/b'));
    expect(document.title).toBe('Shell');
  });

  it('keeps title after commit clears preview state', () => {
    document.title = 'Shell';
    const to = matchedRoute('/a', { metaTitle: 'A' });
    optimisticMeta.preview(10, to);
    applyRouteMeta(to);
    optimisticMeta.clear(10);
    optimisticMeta.rollback(10);
    expect(document.title).toBe('A');
  });

  it('ignores preview when route does not resolve explicit title', () => {
    document.title = 'Shell';
    optimisticMeta.preview(10, matchedRoute('/a'));
    expect(document.title).toBe('Shell');
  });

  it('restores stable title after overlapping previews are cancelled', () => {
    document.title = 'Shell';
    optimisticMeta.preview(1, matchedRoute('/slow', { metaTitle: 'Slow' }));
    optimisticMeta.preview(2, matchedRoute('/about', { metaTitle: 'About' }));
    expect(document.title).toBe('About');

    optimisticMeta.rollback(2);
    expect(document.title).toBe('Slow');

    optimisticMeta.rollback(1);
    expect(document.title).toBe('Shell');
  });
});

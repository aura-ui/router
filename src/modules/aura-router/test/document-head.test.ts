/** @jest-environment jsdom */

import { AuraRoute } from '../../aura-route/core/aura-route';
import { applyDocumentHead } from '../core/document-head';

function matchedRoute(
  path: string,
  attrs: {
    metaTitle?: string;
    metaDescription?: string;
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

describe('applyDocumentHead', () => {
  afterEach(() => {
    document.title = '';
    document.head.querySelector('meta[name="description"]')?.remove();
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.body.replaceChildren();
  });

  it('writes document.title and creates description meta', () => {
    applyDocumentHead(
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

  it('writes canonical from htmlHead even without description', () => {
    applyDocumentHead(matchedRoute('/about'), {
      title: 'About',
      canonical: 'https://example.com/about',
    });

    expect(document.title).toBe('About');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://example.com/about',
    );
    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('is a no-op when there is nothing to apply', () => {
    document.title = 'Keep';
    applyDocumentHead(matchedRoute('/x'));
    expect(document.title).toBe('Keep');
  });
});

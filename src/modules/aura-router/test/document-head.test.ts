/** @jest-environment jsdom */

import { AuraRoute } from '../../aura-route/core/aura-route';

type ApplyDocumentHead = typeof import('../core/document-head').applyDocumentHead;

let applyDocumentHead: ApplyDocumentHead;

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
  beforeEach(() => {
    jest.resetModules();
    applyDocumentHead = require('../core/document-head').applyDocumentHead;
  });

  afterEach(() => {
    document.title = '';
    document.head.replaceChildren();
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

    applyDocumentHead(matchedRoute('/x'));

    expect(document.title).toBe('Keep');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Site');
  });

  it('restores boot title when the next resolve omits it', () => {
    document.title = 'Shell';
    applyDocumentHead(matchedRoute('/a', { metaTitle: 'A' }));
    applyDocumentHead(matchedRoute('/b'));

    expect(document.title).toBe('Shell');
  });

  it('removes owned description and canonical when the next resolve omits them', () => {
    applyDocumentHead(matchedRoute('/a', { metaTitle: 'A', metaDescription: 'About' }), {
      tags: { 'link:rel:canonical': 'https://example.com/a' },
    });
    applyDocumentHead(matchedRoute('/b'));

    expect(document.querySelector('meta[name="description"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('takes over a boot description and removes it on the next omit', () => {
    const boot = document.head.appendChild(document.createElement('meta'));
    boot.setAttribute('name', 'description');
    boot.setAttribute('content', 'Site');

    applyDocumentHead(matchedRoute('/about', { metaDescription: 'About' }));
    applyDocumentHead(matchedRoute('/empty'));

    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('writes and reverts open graph tags from htmlHead', () => {
    applyDocumentHead(matchedRoute('/a'), { tags: { 'meta:property:og:title': 'Share A' } });
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Share A');

    applyDocumentHead(matchedRoute('/b'));
    expect(document.querySelector('meta[property="og:title"]')).toBeNull();
  });
});

/** @jest-environment jsdom */

import { AuraRouter } from '../core/aura-router';
import { applyDocumentMeta } from '../core/document-meta';

import { matchedRoute, resetDocumentMetaDom } from './_helpers/matched-route';

describe('applyDocumentMeta', () => {
  afterEach(resetDocumentMetaDom);

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

  it('restores boot dir when the next resolve omits it', () => {
    document.documentElement.setAttribute('dir', 'ltr');
    applyDocumentMeta(matchedRoute('/a'), { dir: 'rtl' });
    applyDocumentMeta(matchedRoute('/b'));

    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('writes and reverts open graph tags from htmlMeta', () => {
    applyDocumentMeta(matchedRoute('/a'), { tags: { 'meta:property:og:title': 'Share A' } });
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Share A');

    applyDocumentMeta(matchedRoute('/b'));
    expect(document.querySelector('meta[property="og:title"]')).toBeNull();
  });

  it('applies tags registered via AuraRouter.configure', () => {
    AuraRouter.configure({
      documentMeta: { tags: [{ tag: 'meta', attrs: { name: 'theme-color' } }] },
    });

    applyDocumentMeta(matchedRoute('/a'), { tags: { 'meta:name:theme-color': '#111' } });
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#111');
  });
});

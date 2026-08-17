/** @jest-environment jsdom */

import { AuraRoute } from '../../../aura-route/core/aura-route';
import { stringToHtml } from '../../../aura-utils/misc/dom';
import {
  extractDocumentHead,
  hasDocumentHead,
  resolveDocumentHeadWithParams,
  configureDocumentHead,
} from '../../core/document';
import { META_DESCRIPTION_ID } from '../../core/document/schema';

const FULL_PAGE = `<!DOCTYPE html>
<html>
  <head>
    <title>Legacy</title>
    <meta name="description" content="About page" />
  </head>
  <body>
    <main id="content"><h1>About</h1></main>
  </body>
</html>`;

function matchedRoute(
  path: string,
  attrs: {
    metaTitle?: string;
    metaTitleTemplate?: string;
    metaDescription?: string;
    params?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
) {
  if (!customElements.get(AuraRoute.is)) {
    customElements.define(AuraRoute.is, AuraRoute);
  }
  const route = document.createElement(AuraRoute.is) as AuraRoute;
  route.setAttribute('path', path);
  if (attrs.metaTitle) route.setAttribute('meta-title', attrs.metaTitle);
  if (attrs.metaTitleTemplate) route.setAttribute('meta-title-template', attrs.metaTitleTemplate);
  if (attrs.metaDescription) route.setAttribute('meta-description', attrs.metaDescription);

  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route,
    params: attrs.params,
    query: attrs.query,
    viewKey: `view:${path}`,
  };
}

describe('hasDocumentHead', () => {
  it('is true when title or a tag is set', () => {
    expect(hasDocumentHead({ title: 'A' })).toBe(true);
    expect(hasDocumentHead({ tags: { [META_DESCRIPTION_ID]: 'D' } })).toBe(true);
    expect(hasDocumentHead({ tags: { 'link:rel:canonical': 'https://x' } })).toBe(true);
    expect(hasDocumentHead({})).toBe(false);
    expect(hasDocumentHead(undefined)).toBe(false);
  });
});

describe('extractDocumentHead', () => {
  it('reads title and description from a parsed document', () => {
    expect(extractDocumentHead(stringToHtml(FULL_PAGE))).toEqual({
      title: 'Legacy',
      tags: { [META_DESCRIPTION_ID]: 'About page' },
    });
  });

  it('reads canonical when present', () => {
    const html = `<html><head>
      <title>T</title>
      <link rel="canonical" href="https://example.com/about" />
    </head></html>`;
    expect(extractDocumentHead(stringToHtml(html))).toEqual({
      title: 'T',
      tags: { 'link:rel:canonical': 'https://example.com/about' },
    });
  });

  it('reads open graph and twitter tags', () => {
    const html = `<html><head>
      <meta property="og:title" content="OG" />
      <meta property="og:image" content="https://img/og.png" />
      <meta name="twitter:card" content="summary" />
    </head></html>`;
    expect(extractDocumentHead(stringToHtml(html))).toEqual({
      tags: {
        'meta:property:og:title': 'OG',
        'meta:property:og:image': 'https://img/og.png',
        'meta:name:twitter:card': 'summary',
      },
    });
  });

  it('returns undefined when head fields are absent', () => {
    expect(extractDocumentHead(stringToHtml('<div>no head</div>'))).toBeUndefined();
  });

  it('reads configured tags from configureDocumentHead', () => {
    configureDocumentHead([{ tag: 'meta', attrs: { name: 'theme-color' } }]);
    try {
      const html = `<html><head><meta name="theme-color" content="#111" /></head></html>`;
      expect(extractDocumentHead(stringToHtml(html))).toEqual({
        tags: { 'meta:name:theme-color': '#111' },
      });
    } finally {
      configureDocumentHead();
    }
  });
});

describe('resolveDocumentHeadWithParams', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolves attrs with :param tokens', () => {
    const to = matchedRoute('/users/:id', {
      metaTitle: 'User :id',
      metaDescription: 'Profile :id',
      params: { id: '42' },
    });

    expect(resolveDocumentHeadWithParams(to)).toEqual({
      title: 'User 42',
      tags: { [META_DESCRIPTION_ID]: 'Profile 42' },
    });
  });

  it('falls back to htmlHead argument when attrs are absent', () => {
    expect(
      resolveDocumentHeadWithParams(matchedRoute('/about'), {
        title: 'About from HTML',
        tags: { [META_DESCRIPTION_ID]: 'HTML desc' },
      }),
    ).toEqual({
      title: 'About from HTML',
      tags: { [META_DESCRIPTION_ID]: 'HTML desc' },
    });
  });

  it('keeps extracted canonical when attrs only set title', () => {
    expect(
      resolveDocumentHeadWithParams(matchedRoute('/about', { metaTitle: 'Attr title' }), {
        title: 'HTML title',
        tags: { 'link:rel:canonical': 'https://example.com/about' },
      }),
    ).toEqual({
      title: 'Attr title',
      tags: { 'link:rel:canonical': 'https://example.com/about' },
    });
  });

  it('returns null when no attrs and no htmlHead', () => {
    expect(resolveDocumentHeadWithParams(matchedRoute('/empty'))).toBeNull();
  });

  it('keeps literal ? in title (not view-search syntax)', () => {
    expect(
      resolveDocumentHeadWithParams(
        matchedRoute('/faq', { metaTitle: 'FAQ?' }),
      ),
    ).toEqual({ title: 'FAQ?' });
  });

  it('fills :name from query when the param is absent', () => {
    expect(
      resolveDocumentHeadWithParams(
        matchedRoute('/search', { metaTitle: 'q=:q', query: { q: 'aura' } }),
      ),
    ).toEqual({ title: 'q=aura' });
  });

  it('wraps local meta-title with meta-title-template', () => {
    expect(
      resolveDocumentHeadWithParams(
        matchedRoute('/users/:id', {
          metaTitle: 'User :id',
          metaTitleTemplate: '%s | App',
          params: { id: '42' },
        }),
      ),
    ).toEqual({ title: 'User 42 | App' });
  });

  it('wraps HTML title when meta-title is absent', () => {
    expect(
      resolveDocumentHeadWithParams(
        matchedRoute('/about', { metaTitleTemplate: '%s | App' }),
        { title: 'About from HTML' },
      ),
    ).toEqual({ title: 'About from HTML | App' });
  });

  it('uses inherited meta-title as default without wrapping', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('meta-title', 'App');
    router.setAttribute('meta-title-template', '%s | App');
    const to = matchedRoute('/home');
    router.append(to.route);
    document.body.append(router);

    expect(resolveDocumentHeadWithParams(to)).toEqual({ title: 'App' });
  });

  it('does not wrap when meta-title-template is none', () => {
    expect(
      resolveDocumentHeadWithParams(
        matchedRoute('/landing', { metaTitle: 'Launch', metaTitleTemplate: 'none' }),
      ),
    ).toEqual({ title: 'Launch' });
  });

  it('wraps HTML title after meta-title none (inherit opt-out)', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('meta-title', 'App');
    router.setAttribute('meta-title-template', '%s | App');
    const to = matchedRoute('/bare', { metaTitle: 'none' });
    router.append(to.route);
    document.body.append(router);

    expect(
      resolveDocumentHeadWithParams(to, { title: 'About from HTML' }),
    ).toEqual({ title: 'About from HTML | App' });
  });
});

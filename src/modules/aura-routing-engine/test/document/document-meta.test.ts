/** @jest-environment jsdom */

import { AuraRoute } from '../../../aura-route/core/aura-route';
import { stringToHtml } from '../../../aura-utils/misc/dom';
import {
  extractDocumentMeta,
  hasDocumentMeta,
  processHtml,
  resolveDocumentMetaWithParams,
  configureDocumentMeta,
  CANONICAL_ID,
  META_DESCRIPTION_ID,
} from '../../core/document';

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
    metaCanonical?: string;
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
  if (attrs.metaCanonical) route.setAttribute('meta-canonical', attrs.metaCanonical);

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

function routeUnderParent(
  routeAttrs: Parameters<typeof matchedRoute>[1] = {},
  parentAttrs: Record<string, string> = {},
  routerAttrs: Record<string, string> = {},
) {
  const router = document.createElement('aura-router');
  for (const [name, value] of Object.entries(routerAttrs)) {
    router.setAttribute(name, value);
  }
  const parent = document.createElement('aura-route');
  parent.setAttribute('path', '/section');
  for (const [name, value] of Object.entries(parentAttrs)) {
    parent.setAttribute(name, value);
  }
  const to = matchedRoute('/page', routeAttrs);
  parent.append(to.route);
  router.append(parent);
  document.body.append(router);
  return to;
}

describe('hasDocumentMeta', () => {
  it('is true when title, html attrs, or a tag is set', () => {
    expect(hasDocumentMeta({ title: 'A' })).toBe(true);
    expect(hasDocumentMeta({ lang: 'de' })).toBe(true);
    expect(hasDocumentMeta({ dir: 'rtl' })).toBe(true);
    expect(hasDocumentMeta({ tags: { [META_DESCRIPTION_ID]: 'D' } })).toBe(true);
    expect(hasDocumentMeta({ tags: { [CANONICAL_ID]: 'https://x' } })).toBe(true);
    expect(hasDocumentMeta({})).toBe(false);
    expect(hasDocumentMeta(undefined)).toBe(false);
  });
});

describe('extractDocumentMeta', () => {
  afterEach(() => {
    configureDocumentMeta();
  });

  it('reads title and description from a parsed document', () => {
    expect(extractDocumentMeta(stringToHtml(FULL_PAGE))).toEqual({
      title: 'Legacy',
      tags: { [META_DESCRIPTION_ID]: 'About page' },
    });
  });

  it('reads canonical when present', () => {
    const html = `<html><head>
      <title>T</title>
      <link rel="canonical" href="https://example.com/about" />
    </head></html>`;
    expect(extractDocumentMeta(stringToHtml(html))).toEqual({
      title: 'T',
      tags: { [CANONICAL_ID]: 'https://example.com/about' },
    });
  });

  it('reads open graph and twitter tags', () => {
    const html = `<html><head>
      <meta property="og:title" content="OG" />
      <meta property="og:image" content="https://img/og.png" />
      <meta name="twitter:card" content="summary" />
    </head></html>`;
    expect(extractDocumentMeta(stringToHtml(html))).toEqual({
      tags: {
        'meta:property:og:title': 'OG',
        'meta:property:og:image': 'https://img/og.png',
        'meta:name:twitter:card': 'summary',
      },
    });
  });

  it('reads lang and dir from the html element', () => {
    const html = `<html lang="de" dir="rtl"><head><title>T</title></head></html>`;
    expect(extractDocumentMeta(stringToHtml(html))).toEqual({
      title: 'T',
      lang: 'de',
      dir: 'rtl',
    });
  });

  it('returns undefined when meta fields are absent', () => {
    expect(extractDocumentMeta(stringToHtml('<div>no head</div>'))).toBeUndefined();
  });

  it('keeps default tags when configured tags are added', () => {
    configureDocumentMeta([{ tag: 'meta', attrs: { name: 'theme-color' } }]);
    const html = `<html><head>
      <title>T</title>
      <meta name="description" content="Desc" />
      <meta name="theme-color" content="#111" />
    </head></html>`;
    expect(extractDocumentMeta(stringToHtml(html))).toEqual({
      title: 'T',
      tags: {
        [META_DESCRIPTION_ID]: 'Desc',
        'meta:name:theme-color': '#111',
      },
    });
  });

  it('reads link tags with multiple identifying attrs', () => {
    configureDocumentMeta([{ tag: 'link', attrs: { rel: 'alternate', hreflang: 'en' } }]);
    const html = `<html><head>
      <link rel="alternate" hreflang="en" href="https://example.com/en" />
    </head></html>`;
    expect(extractDocumentMeta(stringToHtml(html))).toEqual({
      tags: { 'link:rel:alternate:hreflang:en': 'https://example.com/en' },
    });
  });
});

describe('processHtml', () => {
  it('returns the original string when extract is omitted', () => {
    expect(processHtml(FULL_PAGE, null, '/about')).toEqual({
      fragment: FULL_PAGE,
      meta: {
        title: 'Legacy',
        tags: { [META_DESCRIPTION_ID]: 'About page' },
      },
    });
  });

  it('extracts a fragment but reads meta from the full document', () => {
    const { fragment, meta } = processHtml(FULL_PAGE, '#content', '/about');
    expect(fragment).toBe('<main id="content"><h1>About</h1></main>');
    expect(meta).toEqual({
      title: 'Legacy',
      tags: { [META_DESCRIPTION_ID]: 'About page' },
    });
  });

  it('warns and keeps full html when the selector misses', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(processHtml(FULL_PAGE, '#missing', '/about')).toEqual({
      fragment: FULL_PAGE,
      meta: {
        title: 'Legacy',
        tags: { [META_DESCRIPTION_ID]: 'About page' },
      },
    });
    expect(warn).toHaveBeenCalledWith(
      'Nothing found for extract selector "#missing" — using full HTML. Page — /about',
    );
    warn.mockRestore();
  });

  it('warns and keeps full html when the selector is invalid CSS', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(processHtml(FULL_PAGE, '#[', '/about')).toEqual({
      fragment: FULL_PAGE,
      meta: {
        title: 'Legacy',
        tags: { [META_DESCRIPTION_ID]: 'About page' },
      },
    });
    expect(warn).toHaveBeenCalledWith(
      'Nothing found for extract selector "#[" — using full HTML. Page — /about',
    );
    warn.mockRestore();
  });
});

describe('resolveDocumentMetaWithParams', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolves attrs with :param tokens', () => {
    const to = matchedRoute('/users/:id', {
      metaTitle: 'User :id',
      metaDescription: 'Profile :id',
      params: { id: '42' },
    });

    expect(resolveDocumentMetaWithParams(to)).toEqual({
      title: 'User 42',
      tags: { [META_DESCRIPTION_ID]: 'Profile 42' },
    });
  });

  it('falls back to htmlMeta argument when attrs are absent', () => {
    expect(
      resolveDocumentMetaWithParams(matchedRoute('/about'), {
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
      resolveDocumentMetaWithParams(matchedRoute('/about', { metaTitle: 'Attr title' }), {
        title: 'HTML title',
        tags: { [CANONICAL_ID]: 'https://example.com/about' },
      }),
    ).toEqual({
      title: 'Attr title',
      tags: { [CANONICAL_ID]: 'https://example.com/about' },
    });
  });

  it('overlays meta-canonical on htmlMeta with :param tokens', () => {
    const to = matchedRoute('/users/:id', {
      metaCanonical: 'https://example.com/users/:id',
      params: { id: '42' },
    });
    expect(resolveDocumentMetaWithParams(to)).toEqual({
      tags: { [CANONICAL_ID]: 'https://example.com/users/42' },
    });
    expect(
      resolveDocumentMetaWithParams(to, { tags: { [CANONICAL_ID]: 'https://example.com/wrong' } }),
    ).toEqual({
      tags: { [CANONICAL_ID]: 'https://example.com/users/42' },
    });
  });

  it('returns null when no attrs and no htmlMeta', () => {
    expect(resolveDocumentMetaWithParams(matchedRoute('/empty'))).toBeNull();
  });

  it('keeps literal ? in title (not view-search syntax)', () => {
    expect(
      resolveDocumentMetaWithParams(
        matchedRoute('/faq', { metaTitle: 'FAQ?' }),
      ),
    ).toEqual({ title: 'FAQ?' });
  });

  it('fills :name from query when the param is absent', () => {
    expect(
      resolveDocumentMetaWithParams(
        matchedRoute('/search', { metaTitle: 'q=:q', query: { q: 'aura' } }),
      ),
    ).toEqual({ title: 'q=aura' });
  });

  it('prefers path params over query for :name tokens', () => {
    expect(
      resolveDocumentMetaWithParams(
        matchedRoute('/items/:id', {
          metaTitle: ':id/:q',
          params: { id: '1' },
          query: { q: 'query', id: '9' },
        }),
      ),
    ).toEqual({ title: '1/query' });
  });

  it('passes lang and dir through from htmlMeta', () => {
    expect(
      resolveDocumentMetaWithParams(matchedRoute('/de', { metaTitle: 'DE' }), {
        lang: 'de',
        dir: 'rtl',
      }),
    ).toEqual({ title: 'DE', lang: 'de', dir: 'rtl' });
  });

  it('uses page title as-is when the template has no %s', () => {
    expect(
      resolveDocumentMetaWithParams(
        matchedRoute('/about', { metaTitleTemplate: 'Ignored prefix' }),
        { title: 'About' },
      ),
    ).toEqual({ title: 'About' });
  });

  it('wraps local meta-title with meta-title-template', () => {
    expect(
      resolveDocumentMetaWithParams(
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
      resolveDocumentMetaWithParams(
        matchedRoute('/about', { metaTitleTemplate: '%s | App' }),
        { title: 'About from HTML' },
      ),
    ).toEqual({ title: 'About from HTML | App' });
  });

  it('uses inherited meta-title as default without wrapping', () => {
    const to = routeUnderParent({}, { 'meta-title': 'App' }, { 'meta-title-template': '%s | App' });
    expect(resolveDocumentMetaWithParams(to)).toEqual({ title: 'App' });
  });

  it('wraps HTML title rather than inherited meta-title', () => {
    const to = routeUnderParent({}, { 'meta-title': 'App' }, { 'meta-title-template': '%s | App' });
    expect(resolveDocumentMetaWithParams(to, { title: 'About' })).toEqual({
      title: 'About | App',
    });
  });

  it('does not wrap when meta-title-template is none', () => {
    expect(
      resolveDocumentMetaWithParams(
        matchedRoute('/landing', { metaTitle: 'Launch', metaTitleTemplate: 'none' }),
      ),
    ).toEqual({ title: 'Launch' });
  });

  it('wraps HTML title after meta-title none (inherit opt-out)', () => {
    const to = routeUnderParent(
      { metaTitle: 'none' },
      { 'meta-title': 'App' },
      { 'meta-title-template': '%s | App' },
    );
    expect(
      resolveDocumentMetaWithParams(to, { title: 'About from HTML' }),
    ).toEqual({ title: 'About from HTML | App' });
  });

  it('omits whitespace-only token results and falls back to HTML', () => {
    expect(
      resolveDocumentMetaWithParams(
        matchedRoute('/users/:id', {
          metaTitle: ':id',
          metaDescription: ':id',
          metaCanonical: ':id',
          params: { id: '   ' },
        }),
        {
          title: 'About',
          tags: {
            [META_DESCRIPTION_ID]: 'HTML desc',
            [CANONICAL_ID]: 'https://example.com/about',
          },
        },
      ),
    ).toEqual({
      title: 'About',
      tags: {
        [META_DESCRIPTION_ID]: 'HTML desc',
        [CANONICAL_ID]: 'https://example.com/about',
      },
    });
  });

  it('replaces only the first %s in meta-title-template', () => {
    expect(
      resolveDocumentMetaWithParams(
        matchedRoute('/about', { metaTitleTemplate: '%s | %s' }),
        { title: 'About' },
      ),
    ).toEqual({ title: 'About | %s' });
  });
});

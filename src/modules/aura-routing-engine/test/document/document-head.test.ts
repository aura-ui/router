/** @jest-environment jsdom */

import { AuraRoute } from '../../../aura-route/core/aura-route';
import { stringToHtml } from '../../../aura-utils/misc/dom';
import {
  extractDocumentHead,
  hasDocumentHead,
  resolveDocumentHeadWithParams,
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
  it('is true when title or description is set', () => {
    expect(hasDocumentHead({ title: 'A' })).toBe(true);
    expect(hasDocumentHead({ description: 'D' })).toBe(true);
    expect(hasDocumentHead({ canonical: 'https://x' })).toBe(true);
    expect(hasDocumentHead({})).toBe(false);
    expect(hasDocumentHead(undefined)).toBe(false);
  });
});

describe('extractDocumentHead', () => {
  it('reads title and description from a parsed document', () => {
    expect(extractDocumentHead(stringToHtml(FULL_PAGE))).toEqual({
      title: 'Legacy',
      description: 'About page',
    });
  });

  it('reads canonical when present', () => {
    const html = `<html><head>
      <title>T</title>
      <link rel="canonical" href="https://example.com/about" />
    </head></html>`;
    expect(extractDocumentHead(stringToHtml(html))).toEqual({
      title: 'T',
      canonical: 'https://example.com/about',
    });
  });

  it('returns undefined when head fields are absent', () => {
    expect(extractDocumentHead(stringToHtml('<div>no head</div>'))).toBeUndefined();
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
      description: 'Profile 42',
    });
  });

  it('falls back to htmlHead argument when attrs are absent', () => {
    expect(
      resolveDocumentHeadWithParams(matchedRoute('/about'), {
        title: 'About from HTML',
        description: 'HTML desc',
      }),
    ).toEqual({
      title: 'About from HTML',
      description: 'HTML desc',
    });
  });

  it('keeps extracted canonical when attrs only set title', () => {
    expect(
      resolveDocumentHeadWithParams(matchedRoute('/about', { metaTitle: 'Attr title' }), {
        title: 'HTML title',
        canonical: 'https://example.com/about',
      }),
    ).toEqual({
      title: 'Attr title',
      canonical: 'https://example.com/about',
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
});

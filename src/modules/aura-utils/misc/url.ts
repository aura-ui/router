export type AppHrefParts = { pathname: string; search: string; hash: string };

/**
 * Split an origin-root absolute in-app href (`/path?search#hash`).
 * Does not resolve document-relative segments — use app-href resolution first.
 */
export function splitAppHref(href: string): AppHrefParts {
  if (href.startsWith('/') && !href.startsWith('//')) {
    let pathname = href;
    let search = '';
    let hash = '';
    const hashIndex = href.indexOf('#');
    if (hashIndex !== -1) {
      hash = href.slice(hashIndex);
      pathname = href.slice(0, hashIndex);
    }
    const searchIndex = pathname.indexOf('?');
    if (searchIndex !== -1) {
      search = pathname.slice(searchIndex);
      pathname = pathname.slice(0, searchIndex);
    }
    return { pathname, search, hash };
  }

  const { pathname, search, hash } = new URL(href, window.location.origin);
  return { pathname, search, hash };
}

export function joinAppHref(parts: AppHrefParts): string {
  return parts.pathname + parts.search + parts.hash;
}

/** Remove trailing `/` (keeps root `/` unchanged). */
export function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Parse a URL `search` string (`?a=1`) into a query record; `undefined` when empty. */
export function parseSearch(search: string): Record<string, string> | undefined {
  if (!search || search === '?') return undefined;

  const params = new URLSearchParams(search);
  if (params.size === 0) return undefined;
  return Object.fromEntries(params);
}

export type AppHrefParts = { pathname: string; search: string; hash: string };

/** Remove trailing `/` (keeps root `/` unchanged). */
export function stripTrailingSlash(path: string): string {
  if (path.length <= 1) return path; // root или пустая строка
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Split an origin-root absolute in-app href (`/path?search#hash`).
 * Does not resolve document-relative segments — use app-href resolution first.
 */
export function splitAppHref(href: string): AppHrefParts {
  let parts: AppHrefParts;

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
    parts = { pathname, search, hash };
  } else {
    const { pathname, search, hash } = new URL(href, window.location.origin);
    parts = { pathname, search, hash };
  }

  return { pathname: stripTrailingSlash(parts.pathname), search: parts.search, hash: parts.hash };
}

export function joinAppHref(parts: AppHrefParts): string {
  return parts.pathname + parts.search + parts.hash;
}

/** Parse a URL `search` string (`?a=1`) into a query record; `undefined` when empty. */
export function parseSearch(search: string): Record<string, string> | undefined {
  if (!search || search === '?') return undefined;

  const params = new URLSearchParams(search);
  if (params.size === 0) return undefined;
  return Object.fromEntries(params);
}

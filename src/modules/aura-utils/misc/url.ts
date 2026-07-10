export type AppHrefParts = { pathname: string; search: string; hash: string };

/** App-relative href after document resolution (`pathname + search + hash` + parts). */
export type ResolvedDocumentHref = AppHrefParts & { href: string };

/**
 * Split an origin-root absolute in-app href (`/path?search#hash`).
 * Does not resolve document-relative segments — use {@link resolveDocumentHrefParts} first.
 */
export function splitAppHref(href: string): AppHrefParts {
  if (href.startsWith('/')) {
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

/** HTML resolution: `new URL(href, base)` → app-relative parts + `href` (`pathname + search + hash`). */
export function resolveDocumentHrefParts(
  href: string,
  baseHref = window.location.href,
): ResolvedDocumentHref {
  const { pathname, search, hash } = new URL(href, baseHref);
  return { href: joinAppHref({ pathname, search, hash }), pathname, search, hash };
}

/** HTML resolution: `new URL(href, base)` → app-relative href (`pathname + search + hash`). */
export function resolveDocumentHref(href: string, baseHref = window.location.href): string {
  return resolveDocumentHrefParts(href, baseHref).href;
}

/** Remove trailing `/` (keeps root `/` unchanged). */
export function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Compare pathnames, ignoring a trailing `/` (except root). */
export function pathnamesEqual(a: string, b: string): boolean {
  if (a === b) return true;
  return stripTrailingSlash(a) === stripTrailingSlash(b);
}

/** Same `pathname` (trailing `/` ignored) and `search`; `hash` is not compared. */
export function isSamePathAndSearch(a: AppHrefParts, b: AppHrefParts): boolean {
  return a.search === b.search && pathnamesEqual(a.pathname, b.pathname);
}

/**
 * `true` when navigation changes only `hash` on the same path + search.
 *
 * @param requireExistingHash — prefetch mode: both URLs must already have a hash
 *   (`/page` → `/page#tab` is not hash-only).
 */
export function isHashOnlyChange(
  next: AppHrefParts,
  current: AppHrefParts,
  options?: { requireExistingHash?: boolean },
): boolean {
  if (!isSamePathAndSearch(next, current)) return false;
  if (!next.hash || next.hash === current.hash) return false;
  if (options?.requireExistingHash && !current.hash) return false;
  return true;
}

/** Parse a URL `search` string (`?a=1`) into a query record; `undefined` when empty. */
export function parseSearch(search: string): Record<string, string> | undefined {
  if (!search || search === '?') return undefined;

  const params = new URLSearchParams(search);
  if (params.size === 0) return undefined;
  return Object.fromEntries(params);
}

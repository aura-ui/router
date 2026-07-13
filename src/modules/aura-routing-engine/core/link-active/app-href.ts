import {
  joinAppHref,
  splitAppHref,
  stripTrailingSlash,
  type AppHrefParts,
} from '../../../aura-utils/misc/url';

/** App-relative href after document resolution (`pathname + search + hash` + parts). */
export type ResolvedDocumentHref = AppHrefParts & { href: string };

/** App-relative href from the address bar (`pathname + search + hash`). */
export function getCurrentAppHref(): string {
  return joinAppHref({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  });
}

/**
 * Absolute document URL used as base for HTML relative `<a href>` resolution.
 * The fragment is stripped — `#section` does not change how `profile` resolves.
 */
export function toDocumentResolutionBase(appHref: string): string {
  const { pathname, search } = splitAppHref(appHref);
  return new URL(joinAppHref({ pathname, search, hash: '' }), window.location.origin).href;
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

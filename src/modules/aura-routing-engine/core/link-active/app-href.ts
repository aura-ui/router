import {
  decodeURIFast,
  stripTrailingSlash,
  type AppHrefParts,
} from '../../../aura-utils/misc/url';

/** App-relative href after document resolution (`pathname + search + hash` + parts). */
export type ResolvedDocumentHref = AppHrefParts & { href: string };

/** App-relative href from the address bar (`pathname + search + hash`). */
export function getCurrentAppHref(): string {
  return (
    decodeURIFast(window.location.pathname) +
    window.location.search +
    window.location.hash
  );
}

/**
 * Base URL для разрешения HTML-относительных `<a href>`.
 * Фрагмент (hash) не участвует в разрешении, поэтому удаляется.
 */
export function toDocumentResolutionBase(appHref: string): string {
  // Если уже нет хеша — возвращаем сразу
  const hashIndex = appHref.indexOf('#');
  const base = hashIndex === -1 ? appHref : appHref.slice(0, hashIndex);

  // new URL нужен только для гарантии валидности и нормализации path/search.
  // Это минимально необходимая операция.
  return new URL(base, window.location.origin).href;
}


/**
 * Navigation ingress: turn a raw href into app-relative parts.
 * Resolves against the document (`new URL(href, base)`), splits pathname/search/hash,
 * and decodes the pathname (`/%D0%B0…` → `/а…`) for stable matching.
 */
export function resolveDocumentHrefParts(
  href: string,
  baseHref = window.location.href,
): ResolvedDocumentHref {
  const { pathname, search, hash } = new URL(href, baseHref);
  const decoded = decodeURIFast(pathname);
  return {
    pathname: decoded,
    search,
    hash,
    href: decoded + search + hash,
  };
}

/** Same as {@link resolveDocumentHrefParts}, but returns only the joined `href` string. */
export function resolveDocumentHref(href: string, baseHref = window.location.href): string {
  return resolveDocumentHrefParts(href, baseHref).href;
}

/** Compare pathnames (trailing `/` ignored via {@link stripTrailingSlash}). */
export function pathnamesEqual(a: string, b: string): boolean {
  if (a === b) return true;
  return stripTrailingSlash(a) === stripTrailingSlash(b);
}

/** Same `pathname` (trailing `/` ignored) and `search`; `hash` is not compared. */
export function isSamePathAndSearch(a: AppHrefParts, b: AppHrefParts): boolean {
  if (a.search !== b.search) return false;
  return pathnamesEqual(a.pathname, b.pathname);
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

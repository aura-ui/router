import { joinAppHref } from '../../../aura-utils/misc/url';
import type { RouteNode } from '../route-tree/route-node.types';

export function applyCanonicalIndexFolderHref(
  pathname: string,
  search: string,
  hash: string,
  node: RouteNode,
): { href: string; pathname: string } {
  let canonicalPathname = pathname;
  if (node.isIndex && node.parent && pathname !== '/') {
    canonicalPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
  }
  return { pathname: canonicalPathname, href: joinAppHref({ pathname: canonicalPathname, search, hash }) };
}

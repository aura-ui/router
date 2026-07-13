import {
  joinAppHref,
  splitAppHref,
  stripTrailingSlash,
} from '../../../aura-utils/misc/url';

import { isSamePathAndSearch } from './app-href';

export function isRouterLinkActive(linkHref: string, currentHref: string): boolean {
  const link = splitAppHref(linkHref);
  const current = splitAppHref(currentHref);

  if (link.hash) return joinAppHref(link) === joinAppHref(current);
  return isSamePathAndSearch(link, current) && current.hash === '';
}

/** Prefix match for folder/section links. Root `/` — only exact. */
export function isRouterLinkBranchActive(linkHref: string, currentHref: string): boolean {
  const link = splitAppHref(linkHref);
  const current = splitAppHref(currentHref);

  if (link.hash || current.hash) return false;
  if (link.search && link.search !== current.search) return false;

  const linkPath = stripTrailingSlash(link.pathname);
  const currentPath = stripTrailingSlash(current.pathname);

  if (linkPath === '/') return currentPath === '/';
  if (currentPath === linkPath) return true;
  return currentPath.startsWith(`${linkPath}/`);
}

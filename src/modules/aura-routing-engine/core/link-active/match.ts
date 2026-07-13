import {
  splitAppHref,
  type AppHrefParts,
} from '../../../aura-utils/misc/url';

import { isSamePathAndSearch } from './app-href';

export interface LinkActiveMatch {
  exact: boolean;
  prefix: boolean;
}

function matchLinkActiveParts(link: AppHrefParts, current: AppHrefParts): LinkActiveMatch {
  if (link.hash) {
    return {
      exact:
        link.pathname === current.pathname &&
        link.search === current.search &&
        link.hash === current.hash,
      prefix: false,
    };
  }

  if (current.hash) return { exact: false, prefix: false };
  if (link.search && link.search !== current.search) return { exact: false, prefix: false };

  const exact = isSamePathAndSearch(link, current);

  const linkPath = link.pathname;
  const currentPath = current.pathname;

  let prefix = false;
  if (linkPath === '/') prefix = currentPath === '/';
  else if (currentPath === linkPath) prefix = true;
  else prefix = currentPath.startsWith(`${linkPath}/`);

  return { exact, prefix };
}

/** Exact + prefix flags for one link against a pre-parsed current href. */
export function matchLinkActive(linkHref: string, current: AppHrefParts): LinkActiveMatch {
  return matchLinkActiveParts(splitAppHref(linkHref), current);
}

/** Exact href match: same path + search; hash rules apply when the link declares a hash. */
export function isExactLinkMatch(linkHref: string, currentHref: string): boolean {
  return matchLinkActiveParts(splitAppHref(linkHref), splitAppHref(currentHref)).exact;
}

/** Prefix match for folder/section links. Root `/` matches only itself. */
export function isPrefixLinkMatch(linkHref: string, currentHref: string): boolean {
  return matchLinkActiveParts(splitAppHref(linkHref), splitAppHref(currentHref)).prefix;
}

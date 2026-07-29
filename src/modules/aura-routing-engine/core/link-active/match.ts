import {
  splitAppHref,
  stripTrailingSlash,
  type AppHrefParts,
} from '../../../aura-utils/misc/url';

export interface LinkActiveMatch {
  exact: boolean;
  prefix: boolean;
}

function matchLinkActiveParts(link: AppHrefParts, current: AppHrefParts): LinkActiveMatch {
  const linkPath = stripTrailingSlash(link.pathname);
  const currentPath = stripTrailingSlash(current.pathname);

  if (link.hash) {
    return {
      exact:
        linkPath === currentPath &&
        link.search === current.search &&
        link.hash === current.hash,
      prefix: false,
    };
  }

  if (current.hash) return { exact: false, prefix: false };

  if (link.search && link.search !== current.search) {
    return { exact: false, prefix: false };
  }

  const exact = link.search === current.search && linkPath === currentPath;

  let prefix = exact;

  if (!prefix && linkPath !== '/') {
    const len = linkPath.length;
    prefix =
      currentPath.length > len &&
      currentPath.charCodeAt(len) === 47 &&
      currentPath.startsWith(linkPath);
  }

  return { exact, prefix };
}

/** Exact + prefix flags for one link against a pre-parsed current href. */
export function matchLinkActive(linkHref: string, current: AppHrefParts): LinkActiveMatch {
  return matchLinkActiveParts(splitAppHref(linkHref), current);
}

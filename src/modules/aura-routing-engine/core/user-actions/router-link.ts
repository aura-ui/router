import {
  getCurrentAppHref,
  isSamePathAndSearch,
  joinAppHref,
  resolveDocumentHref,
  splitAppHref,
  stripTrailingSlash,
  toLinkResolutionBase,
} from '../../../aura-utils/misc/url';
import type { MatchedRouteInfo } from '../match/url-matcher';

export interface RouteTrailEntry {
  pattern: string;
  href: string;
}

export function findRouterLink(
  target: EventTarget | null,
  linksSelector: string,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a');
  if (!anchor?.matches(linksSelector)) return null;
  return anchor;
}

function readLinkHref(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) {
    return null;
  }
  return href;
}

export function resolveLinkHref(anchor: HTMLAnchorElement, baseAppHref?: string): string | null {
  const raw = readLinkHref(anchor);
  if (!raw) return null;
  return resolveDocumentHref(raw, toLinkResolutionBase(baseAppHref ?? getCurrentAppHref()));
}

export function readRouterLinkFromEvent(
  event: Event,
  linksSelector: string,
): { anchor: HTMLAnchorElement; href: string } | null {
  const anchor = findRouterLink(event.target, linksSelector);
  if (!anchor) return null;
  const href = resolveLinkHref(anchor);
  return href ? { anchor, href } : null;
}

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

export function toRouteTrail(chain: readonly MatchedRouteInfo[]): RouteTrailEntry[] {
  return chain.map((e) => ({ pattern: e.pattern, href: e.href }));
}

export function syncRouterActiveLinks(options: {
  root: ParentNode;
  linksSelector: string;
  activeClass?: string;
  branchActiveClass?: string;
  currentHref: string;
}): void {
  const active = options.activeClass?.trim().split(/\s+/).filter(Boolean) ?? [];
  const branch = options.branchActiveClass?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!active.length && !branch.length) return;

  const { root, linksSelector, currentHref } = options;
  root.querySelectorAll(linksSelector).forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return;

    const linkHref = resolveLinkHref(node, currentHref);
    const exact = linkHref !== null && isRouterLinkActive(linkHref, currentHref);
    const inBranch = linkHref !== null && isRouterLinkBranchActive(linkHref, currentHref);

    for (const c of active) node.classList.toggle(c, exact);
    for (const c of branch) node.classList.toggle(c, inBranch);
    if (exact) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
}

import { resolveLinkHref } from '../user-actions/link-resolve';

import { isRouterLinkActive, isRouterLinkBranchActive } from './match';

export interface SyncRouterActiveLinksOptions {
  root: ParentNode;
  linksSelector: string;
  activeClass?: string;
  branchActiveClass?: string;
  currentHref: string;
}

export function syncRouterActiveLinks(options: SyncRouterActiveLinksOptions): void {
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

export interface RouterLinkActiveConfig {
  linksSelector: string;
  routerActiveClass: string | null;
  branchActiveClass: string | null;
  linkActiveRootSelector: string | null;
}

/** Sync active classes on `[data-router-link]` anchors under a router host element. */
export function syncRouterHostActiveLinks(
  host: HTMLElement,
  currentHref: string,
  config: RouterLinkActiveConfig,
): void {
  if (!config.routerActiveClass?.trim() && !config.branchActiveClass?.trim()) return;

  const scope = config.linkActiveRootSelector?.trim();
  syncRouterActiveLinks({
    root: scope ? (host.closest(scope) ?? host) : host,
    linksSelector: config.linksSelector,
    activeClass: config.routerActiveClass ?? undefined,
    branchActiveClass: config.branchActiveClass ?? undefined,
    currentHref,
  });
}

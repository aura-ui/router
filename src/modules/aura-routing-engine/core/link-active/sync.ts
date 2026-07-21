import { splitAppHref } from '../../../aura-utils/misc/url';
import { resolveLinkHref } from '../user-actions/link-resolve';

import { matchLinkActive } from './match';

export interface SyncRouterActiveLinksOptions {
  root: ParentNode;
  linksSelector: string;
  linkActiveClass?: string;
  linkActiveBranchClass?: string;
  currentHref: string;
}

export function syncRouterActiveLinks(options: SyncRouterActiveLinksOptions): void {
  const exactClasses = options.linkActiveClass?.split(/\s+/).filter(Boolean) ?? [];
  const prefixClasses = options.linkActiveBranchClass?.split(/\s+/).filter(Boolean) ?? [];
  if (!exactClasses.length && !prefixClasses.length) return;

  const { root, linksSelector, currentHref } = options;
  const current = splitAppHref(currentHref);

  for (const node of root.querySelectorAll(linksSelector)) {
    if (!(node instanceof HTMLAnchorElement)) continue;

    const linkHref = resolveLinkHref(node, currentHref);
    const { exact, prefix } = linkHref
      ? matchLinkActive(linkHref, current)
      : { exact: false, prefix: false };

    for (const c of exactClasses) node.classList.toggle(c, exact);
    for (const c of prefixClasses) node.classList.toggle(c, prefix);
    if (exact) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  }
}

export interface ActiveLinkSyncConfig {
  linksSelector: string;
  linkActiveClass: string | null;
  linkActiveBranchClass: string | null;
  linksContainerSelector: string | null;
}

/** Sync active classes on `[aura-router-link]` anchors (document-wide unless scoped). */
export function syncRouterHostActiveLinks(
  host: HTMLElement,
  currentHref: string,
  { linksSelector, linkActiveClass, linkActiveBranchClass, linksContainerSelector }: ActiveLinkSyncConfig,
): void {
  if (!linkActiveClass && !linkActiveBranchClass) return;
  syncRouterActiveLinks({
    root: linksContainerSelector ? host.closest(linksContainerSelector) ?? host : host.ownerDocument!,
    linksSelector,
    linkActiveClass: linkActiveClass ?? undefined,
    linkActiveBranchClass: linkActiveBranchClass ?? undefined,
    currentHref,
  });
}

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

  root.querySelectorAll(linksSelector).forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return;

    const linkHref = resolveLinkHref(node, currentHref);
    const { exact: isExactMatch, prefix: isPrefixMatch } = linkHref
      ? matchLinkActive(linkHref, current)
      : { exact: false, prefix: false };

    for (const c of exactClasses) node.classList.toggle(c, isExactMatch);
    for (const c of prefixClasses) node.classList.toggle(c, isPrefixMatch);
    if (isExactMatch) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
}

export interface ActiveLinkSyncConfig {
  linksSelector: string;
  linkActiveClass: string | null;
  linkActiveBranchClass: string | null;
  linksContainerSelector: string | null;
}

/** Sync active classes on `[aura-router-link]` anchors under a router host element. */
export function syncRouterHostActiveLinks(
  host: HTMLElement,
  currentHref: string,
  config: ActiveLinkSyncConfig,
): void {
  if (!config.linkActiveClass && !config.linkActiveBranchClass) return;

  const scope = config.linksContainerSelector;
  syncRouterActiveLinks({
    root: scope ? (host.closest(scope) ?? host) : host,
    linksSelector: config.linksSelector,
    linkActiveClass: config.linkActiveClass ?? undefined,
    linkActiveBranchClass: config.linkActiveBranchClass ?? undefined,
    currentHref,
  });
}

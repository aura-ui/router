import { resolveLinkHref } from '../user-actions/link-resolve';

import { isExactLinkMatch, isPrefixLinkMatch } from './match';

export interface SyncRouterActiveLinksOptions {
  root: ParentNode;
  linksSelector: string;
  exactActiveClass?: string;
  prefixActiveClass?: string;
  currentHref: string;
}

export function syncRouterActiveLinks(options: SyncRouterActiveLinksOptions): void {
  const exactClasses = options.exactActiveClass?.split(/\s+/).filter(Boolean) ?? [];
  const prefixClasses = options.prefixActiveClass?.split(/\s+/).filter(Boolean) ?? [];
  if (!exactClasses.length && !prefixClasses.length) return;

  const { root, linksSelector, currentHref } = options;

  root.querySelectorAll(linksSelector).forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return;

    const linkHref = resolveLinkHref(node, currentHref);
    const isExactMatch = linkHref !== null && isExactLinkMatch(linkHref, currentHref);
    const isPrefixMatch = linkHref !== null && isPrefixLinkMatch(linkHref, currentHref);

    for (const c of exactClasses) node.classList.toggle(c, isExactMatch);
    for (const c of prefixClasses) node.classList.toggle(c, isPrefixMatch);
    if (isExactMatch) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
}

export interface ActiveLinkSyncConfig {
  linksSelector: string;
  exactActiveClass: string | null;
  prefixActiveClass: string | null;
  scopeSelector: string | null;
}

/** Sync active classes on `[data-router-link]` anchors under a router host element. */
export function syncRouterHostActiveLinks(
  host: HTMLElement,
  currentHref: string,
  config: ActiveLinkSyncConfig,
): void {
  if (!config.exactActiveClass && !config.prefixActiveClass) return;

  const scope = config.scopeSelector;
  syncRouterActiveLinks({
    root: scope ? (host.closest(scope) ?? host) : host,
    linksSelector: config.linksSelector,
    exactActiveClass: config.exactActiveClass ?? undefined,
    prefixActiveClass: config.prefixActiveClass ?? undefined,
    currentHref,
  });
}

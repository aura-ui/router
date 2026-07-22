import { splitAppHref } from '../../../aura-utils/misc/url';
import { resolveLinkHref } from '../user-actions/link-resolve';

import { matchLinkActive } from './match';

export interface SyncRouterActiveLinksOptions {
  container: ParentNode;
  linksSelector: string;
  linkActiveClass?: string;
  linkActiveBranchClass?: string;
  currentHref: string;
}

export function syncRouterActiveLinks(options: SyncRouterActiveLinksOptions): void {
  const exactClasses = options.linkActiveClass?.split(/\s+/).filter(Boolean) ?? [];
  const prefixClasses = options.linkActiveBranchClass?.split(/\s+/).filter(Boolean) ?? [];
  if (!exactClasses.length && !prefixClasses.length) return;

  const { container, linksSelector, currentHref } = options;
  const current = splitAppHref(currentHref);

  for (const node of container.querySelectorAll(linksSelector)) {
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

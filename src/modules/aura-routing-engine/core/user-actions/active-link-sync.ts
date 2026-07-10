import type { AppHrefParts } from '../../../aura-utils/misc/url';
import { isSamePathAndSearch, joinAppHref, splitAppHref } from '../../../aura-utils/misc/url';

import { resolveLinkHref } from './router-link';

/**
 * Active-state policy for `<a data-router-link>` (exact match, not branch-active).
 *
 * Two link kinds:
 * - **Path link** — no `#` in resolved href: active when pathname + search match and
 *   the current URL has no hash (`/docs` stays inactive on `/docs#intro`).
 * - **Hash link** — resolved href includes `#`: active only on full href equality.
 */

function parseActiveClassNames(activeClass: string): readonly string[] {
  return activeClass.trim().split(/\s+/).filter(Boolean);
}

function normalizeCurrent(current: string | AppHrefParts): AppHrefParts {
  return typeof current === 'string' ? splitAppHref(current) : current;
}

/** Path link: same route path; current URL must not carry a fragment. */
function matchesPathLink(link: AppHrefParts, current: AppHrefParts): boolean {
  return isSamePathAndSearch(link, current) && current.hash === '';
}

/** Hash link: pathname, search, and fragment must all match. */
function matchesHashLink(link: AppHrefParts, current: AppHrefParts): boolean {
  return joinAppHref(link) === joinAppHref(current);
}

/** Whether resolved link href is active for the given current URL. */
export function isRouterLinkActive(linkHref: string, current: string | AppHrefParts): boolean {
  const link = splitAppHref(linkHref);
  const currentParts = normalizeCurrent(current);
  return link.hash ? matchesHashLink(link, currentParts) : matchesPathLink(link, currentParts);
}

export interface SyncRouterActiveLinksOptions {
  /** Usually `<aura-router>` — only descendants are scanned. */
  root: ParentNode;
  linksSelector: string;
  /** Space-separated CSS class names (`data-router-active-class`). */
  activeClass: string;
  /** Canonical app href after navigation (`ctx.to.href` or hash-only target). */
  currentHref: string;
}

function applyLinkActiveState(
  anchor: HTMLAnchorElement,
  classNames: readonly string[],
  active: boolean,
): void {
  for (const name of classNames) {
    anchor.classList.toggle(name, active);
  }
  if (active) anchor.setAttribute('aria-current', 'page');
  else anchor.removeAttribute('aria-current');
}

/** Sync `activeClass` and `aria-current="page"` on in-app links under `root`. */
export function syncRouterActiveLinks(options: SyncRouterActiveLinksOptions): void {
  const { root, linksSelector, activeClass, currentHref } = options;
  const classNames = parseActiveClassNames(activeClass);
  if (classNames.length === 0) return;

  const current = splitAppHref(currentHref);

  root.querySelectorAll(linksSelector).forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return;

    const linkHref = resolveLinkHref(node, currentHref);
    if (!linkHref) {
      applyLinkActiveState(node, classNames, false);
      return;
    }

    applyLinkActiveState(node, classNames, isRouterLinkActive(linkHref, current));
  });
}

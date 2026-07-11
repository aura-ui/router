import {
  getCurrentAppHref,
  isSamePathAndSearch,
  joinAppHref,
  resolveDocumentHref,
  splitAppHref,
  toLinkResolutionBase,
} from '../../../aura-utils/misc/url';

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

export function syncRouterActiveLinks(options: {
  root: ParentNode;
  linksSelector: string;
  activeClass: string;
  currentHref: string;
}): void {
  const { root, linksSelector, activeClass, currentHref } = options;
  const classNames = activeClass.trim().split(/\s+/).filter(Boolean);
  if (!classNames.length) return;

  root.querySelectorAll(linksSelector).forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return;

    const linkHref = resolveLinkHref(node, currentHref);
    const active = linkHref !== null && isRouterLinkActive(linkHref, currentHref);

    for (const name of classNames) node.classList.toggle(name, active);
    if (active) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
}

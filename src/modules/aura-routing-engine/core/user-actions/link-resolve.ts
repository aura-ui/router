import {
  getCurrentAppHref,
  resolveDocumentHref,
  toLinkResolutionBase,
} from '../link-active/app-href';

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

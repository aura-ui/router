import {
  getCurrentAppHref,
  toDocumentResolutionBase,
  resolveInAppHref,
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

export function resolveLinkHref(anchor: HTMLAnchorElement, baseAppHref?: string): string | null {
  const raw = anchor.getAttribute('href');
  if (!raw) return null;
  return resolveInAppHref(raw, toDocumentResolutionBase(baseAppHref ?? getCurrentAppHref()));
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

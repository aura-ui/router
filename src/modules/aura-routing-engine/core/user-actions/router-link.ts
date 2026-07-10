import { resolveDocumentHref } from '../../../aura-utils/misc/url';

export function findRouterLink(
  target: EventTarget | null,
  linksSelector: string,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;

  const anchor = target.closest('a');
  if (!anchor || !anchor.matches(linksSelector)) return null;
  return anchor;
}

export function readLinkHref(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) {
    return null;
  }
  return href;
}

/** Document-relative href for navigation (`pathname + search + hash`). */
export function resolveLinkHref(anchor: HTMLAnchorElement): string | null {
  const raw = readLinkHref(anchor);
  if (!raw) return null;
  return resolveDocumentHref(raw);
}

/** href + anchor from a DOM event targeting an in-app router link. */
export function readRouterLinkFromEvent(
  event: Event,
  linksSelector: string,
): { anchor: HTMLAnchorElement; href: string } | null {
  const anchor = findRouterLink(event.target, linksSelector);
  if (!anchor) return null;

  const href = resolveLinkHref(anchor);
  if (!href) return null;

  return { anchor, href };
}

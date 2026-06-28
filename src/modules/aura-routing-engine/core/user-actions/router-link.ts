import { LINK_PREFETCH_MODES, type LinkPrefetchMode, type PrefetchMode } from '../prefetch/types';

const PREFETCH_MODES = new Set<LinkPrefetchMode>(LINK_PREFETCH_MODES);

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

/** href + anchor from a DOM event targeting an in-app router link. */
export function readRouterLinkFromEvent(
  event: Event,
  linksSelector: string,
): { anchor: HTMLAnchorElement; href: string } | null {
  const anchor = findRouterLink(event.target, linksSelector);
  if (!anchor) return null;

  const href = readLinkHref(anchor);
  if (!href) return null;

  return { anchor, href };
}

export function resolveLinkPrefetchMode(
  anchor: Element,
  defaultMode: PrefetchMode = 'intent',
): PrefetchMode | null {
  const raw = anchor.getAttribute('data-prefetch')?.trim().toLowerCase();
  if (raw === 'false' || raw === 'none') return null;
  if (raw && PREFETCH_MODES.has(raw as LinkPrefetchMode)) return raw as LinkPrefetchMode;
  return defaultMode;
}

export function resolveLinkTouchPrefetchMode(
  anchor: Element,
  defaultMode: PrefetchMode = 'tap',
): PrefetchMode | null {
  const raw = anchor.getAttribute('data-prefetch')?.trim().toLowerCase();
  if (raw === 'tap') return 'tap';
  return resolveLinkPrefetchMode(anchor, defaultMode);
}

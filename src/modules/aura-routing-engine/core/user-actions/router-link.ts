import type { PrefetchMode } from '../prefetch/types';

const PREFETCH_MODES = new Set<PrefetchMode>(['intent', 'viewport', 'tap', 'render', 'manual']);

export function findRouterLink(
  target: EventTarget | null,
  linksSelector: string,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;

  const anchor = target.closest('a');
  if (!anchor || !anchor.matches(linksSelector)) return null;
  return anchor;
}

export function resolveLinkPrefetchMode(
  anchor: Element,
  defaultMode: PrefetchMode = 'intent',
): PrefetchMode | null {
  const raw = anchor.getAttribute('data-prefetch')?.trim().toLowerCase();
  if (raw === 'false' || raw === 'none') return null;
  if (raw && PREFETCH_MODES.has(raw as PrefetchMode)) return raw as PrefetchMode;
  return defaultMode;
}

export function readLinkHref(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) {
    return null;
  }
  return href;
}

import type { ContentDescriptor, LoaderType } from './types';

export type RouteContentAttrs = {
  layout: string;
  /** Unified content descriptor: `loader:ref` (v3). */
  view: string;
  source: string;
  content: string;
  cache: boolean;
};

export type ParsedViewDescriptor = {
  loader: LoaderType;
  ref: string;
};

/** Parses `view="loader:ref"` — splits on the first colon only. */
export function parseViewDescriptor(view: string): ParsedViewDescriptor | null {
  const trimmed = view.trim();
  if (!trimmed) return null;

  const colon = trimmed.indexOf(':');
  if (colon <= 0) return null;

  return {
    loader: trimmed.slice(0, colon),
    ref: trimmed.slice(colon + 1),
  };
}

/** Maps route attrs to a single content descriptor (layout template or content loader). */
export function buildContentDescriptor(route: RouteContentAttrs): ContentDescriptor {
  if (route.layout?.trim()) {
    return {
      kind: 'layout',
      loader: 'template',
      ref: route.layout,
      cache: false,
    };
  }

  const parsed = route.view?.trim() ? parseViewDescriptor(route.view) : null;
  if (parsed) {
    return {
      kind: 'content',
      loader: parsed.loader,
      ref: parsed.ref,
      cache: Boolean(route.cache),
    };
  }

  return {
    kind: 'content',
    loader: route.source ?? '',
    ref: route.content ?? '',
    cache: Boolean(route.cache),
  };
}

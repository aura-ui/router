import type { ContentDescriptor, LoaderType } from './types';

export type RouteContentAttrs = {
  layout: string;
  /** Unified content descriptor: `loader::ref`. */
  view: string;
  cache: boolean;
};

export type ParsedViewDescriptor = {
  loader: LoaderType;
  ref: string;
};

/** Parses `view="loader::ref"` — splits on the first `::` only. */
export function parseViewDescriptor(view: string): ParsedViewDescriptor | null {
  const trimmed = view.trim();
  if (!trimmed) return null;

  const sep = trimmed.indexOf('::');
  if (sep <= 0) return null;

  return {
    loader: trimmed.slice(0, sep),
    ref: trimmed.slice(sep + 2),
  };
}

/** Content descriptor from upgraded `<aura-route>` (render + prefetch). */
export function contentDescriptorFromRoute(route: RouteContentAttrs): ContentDescriptor {
  return buildContentDescriptor(route);
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
  return {
    kind: 'content',
    loader: parsed?.loader ?? '',
    ref: parsed?.ref ?? '',
    cache: Boolean(route.cache),
  };
}

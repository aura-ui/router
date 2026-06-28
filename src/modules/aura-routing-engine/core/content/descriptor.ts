import type { ContentDescriptor, LoaderType } from './types';
import type { PreserveFlags } from './preserve';

export type RouteContentAttrs = {
  layout: string;
  /** Unified content descriptor: `loader::ref`. */
  view: string;
  preserve: PreserveFlags;
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
    cache: route.preserve.data,
  };
}

import type { ContentDescriptor } from './types';

export type RouteContentAttrs = {
  layout: string;
  source: string;
  content: string;
  cache: boolean;
};

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

  return {
    kind: 'content',
    loader: route.source ?? '',
    ref: route.content ?? '',
    cache: Boolean(route.cache),
  };
}

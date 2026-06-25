import type { AuraRouteInterface } from '../types';
import type { ContentDescriptor } from './types';

/** Maps route attrs to a single content descriptor (layout template or content loader). */
export function contentDescriptor(route: AuraRouteInterface): ContentDescriptor {
  if (route.layout.trim()) {
    return {
      kind: 'layout',
      loader: 'template',
      ref: route.layout,
      cache: false,
    };
  }

  return {
    kind: 'content',
    loader: route.source,
    ref: route.content,
    cache: route.cache,
  };
}

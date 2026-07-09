import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import type { ContentDescriptor } from './types';

export type RouteContentSource = {
  readonly layout: string;
  readonly preserve: { readonly view: boolean };
  readonly extract?: string | null;
};

type ResolvedView = {
  readonly type: LoaderType;
  readonly ref: string;
};

export function buildContentDescriptor(
  route: RouteContentSource,
  resolvedView: ResolvedView | null | undefined,
): ContentDescriptor | null {
  const layout = route.layout.trim();
  if (layout) {
    return { kind: 'layout', loader: 'template', ref: layout, cache: false };
  }

  if (!resolvedView?.type) {
    return null;
  }

  return {
    kind: 'content',
    loader: resolvedView.type,
    ref: resolvedView.ref,
    cache: route.preserve.view,
    ...(resolvedView.type === 'url' && route.extract ? { extract: route.extract } : {}),
  };
}

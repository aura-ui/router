import type { ViewAttrDescriptor, LoaderId } from '../../../aura-route/core/attr/view-attr-parser';
import type { MatchedRouteInfo } from '../match/url-matcher';

import { resolveViewContent } from './resolve-view-content';

export type ResolvedView = {
  loader: LoaderId;
  content: string;
  viewKey: string;
};

function resolveView(view: ViewAttrDescriptor, leaf: MatchedRouteInfo): ResolvedView {
  const content = resolveViewContent(view.content, {
    params: leaf.params,
    query: leaf.query,
    search: leaf.search,
  });
  return { loader: view.loader, content, viewKey: `${view.loader}:${content}` };
}

export function attachResolvedView(leaf: MatchedRouteInfo): void {
  if (leaf.resolvedView !== undefined) return;

  const route = leaf.route as { view?: ViewAttrDescriptor | null; layout?: string } | undefined;
  if (route?.layout?.trim()) {
    leaf.resolvedView = null;
    return;
  }

  const view = route?.view;
  leaf.resolvedView = view?.loader && view.content ? resolveView(view, leaf) : null;
}

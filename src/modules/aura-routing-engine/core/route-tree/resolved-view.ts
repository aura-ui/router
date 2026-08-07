import type { ViewAttrDescriptor, LoaderId } from '../../../aura-route/core/attr/view-attr-parser';
import type { MatchedRouteInfo } from '../match/url-matcher';

export type ResolvedView = {
  loader: LoaderId;
  content: string;
  viewKey: string;
};

const PATH_PARAM_TOKEN = /:(\w+)/g;

/** Replace `:name` in `view` content with matched route params (same tokens as `path`). */
function resolveContent(content: string, params?: Record<string, string>): string {
  if (!params || !content.includes(':')) return content;
  return content.replace(PATH_PARAM_TOKEN, (token, name: string) => params[name] ?? token);
}

function resolveView(view: ViewAttrDescriptor, params?: Record<string, string>): ResolvedView {
  const content = resolveContent(view.content, params);
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
  leaf.resolvedView = view?.loader && view.content ? resolveView(view, leaf.params) : null;
}

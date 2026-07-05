import type { ViewAttrDescriptor } from '../../../aura-route/core/attr/view-attr-parser';
import type { MatchedRouteInfo } from '../match/url-matcher';

export type ResolvedView = {
  type: string;
  ref: string;
  viewKey: string;
};

const PARAM_PLACEHOLDER = /\{\{(\w+)\}\}/g;

function resolveRef(ref: string, params?: Record<string, string>): string {
  if (!params || !ref.includes('{{')) return ref;
  return ref.replace(PARAM_PLACEHOLDER, (_, name: string) => params[name] ?? `{{${name}}}`);
}

function resolveView(view: ViewAttrDescriptor, params?: Record<string, string>): ResolvedView {
  const ref = resolveRef(view.content, params);
  return { type: view.type, ref, viewKey: `${view.type}:${ref}` };
}

export function attachResolvedView(leaf: MatchedRouteInfo): void {
  if (leaf.resolvedView !== undefined) return;

  const route = leaf.route as { view?: ViewAttrDescriptor | null; layout?: string } | undefined;
  if (route?.layout?.trim()) {
    leaf.resolvedView = null;
    return;
  }

  const view = route?.view;
  leaf.resolvedView = view?.type && view.content ? resolveView(view, leaf.params) : null;
}

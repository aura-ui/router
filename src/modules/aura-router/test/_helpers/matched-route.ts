import { AuraRoute } from '../../../aura-route/core/aura-route';
import { configureDocumentMeta } from '../../../aura-routing-engine/core/document';

import { DOCUMENT_META_BOOT } from '../../core/document-meta';
export function matchedRoute(
  path: string,
  attrs: {
    metaTitle?: string;
    metaDescription?: string;
    metaCanonical?: string;
    params?: Record<string, string>;
  } = {},
) {
  if (!customElements.get(AuraRoute.is)) {
    customElements.define(AuraRoute.is, AuraRoute);
  }
  const route = document.createElement(AuraRoute.is) as AuraRoute;
  route.setAttribute('path', path);
  if (attrs.metaTitle) route.setAttribute('meta-title', attrs.metaTitle);
  if (attrs.metaDescription) route.setAttribute('meta-description', attrs.metaDescription);
  if (attrs.metaCanonical) route.setAttribute('meta-canonical', attrs.metaCanonical);

  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route,
    params: attrs.params,
    viewKey: `view:${path}`,
  };
}

export function resetDocumentMetaDom(): void {
  document.title = '';
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
  document.head.replaceChildren();
  document.body.replaceChildren();
  delete (document as Document & { [DOCUMENT_META_BOOT]?: unknown })[DOCUMENT_META_BOOT];
  configureDocumentMeta();
}

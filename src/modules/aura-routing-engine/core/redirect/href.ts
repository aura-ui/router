import { resolvePattern } from '../route-tree/resolve-pattern';
import { resolveDocumentHrefParts } from '../../../aura-utils/misc/url';
import type { RouteNode } from '../route-tree/route-node.types';

/** Resolves declarative `redirect` attr to an app-relative href (absolute or relative to parent). */
export function resolveRedirectHref(node: RouteNode, rawTarget: string): string {
  const pathname = resolvePattern(node.parent?.pattern ?? null, rawTarget.trim());
  return resolveDocumentHrefParts(pathname).href;
}

export { isRouterLinkActive, isRouterLinkBranchActive } from './match';
export {
  getCurrentAppHref,
  isHashOnlyChange,
  isSamePathAndSearch,
  pathnamesEqual,
  resolveDocumentHref,
  resolveDocumentHrefParts,
  toLinkResolutionBase,
  type ResolvedDocumentHref,
} from './app-href';
export {
  syncRouterActiveLinks,
  syncRouterHostActiveLinks,
  type RouterLinkActiveConfig,
  type SyncRouterActiveLinksOptions,
} from './sync';
export { toRouteTrail, type RouteTrailEntry } from './route-trail';

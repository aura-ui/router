export type { RouteNode, RouteTreeSnapshot } from './route-node.types';

export { resolveFullPath } from './resolve-full-path';

export { buildRouteTree, collectRouteSubtreeNodes } from './build-route-tree';

export {
  routeMatchKey,
  isSameRouteMatch,
  attachNavigationChain,
  getActiveChain,
  getLeafMatch,
  syncChainUrl,
  buildMatchedChain,
} from './matched-chain';

export {
  findBranchLcaIndex,
  findLca,
  findLcaNodes,
  buildExitRoutes,
  buildEnterRoutes,
} from './branch-diff';

export { buildTreeRoadMap } from './transition-plan';

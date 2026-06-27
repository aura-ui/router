export type { RouteNode, RouteTreeSnapshot } from './route-node.types';

export {
  resolvePattern,
  isGlobalCatchAllPattern,
  isScopedCatchAllPattern,
} from './resolve-pattern';

export { buildRouteTree, collectRouteSubtreeNodes } from './build-route-tree';

export {
  routeMatchKey,
  isSameRouteMatch,
  attachNavigationChain,
  getActiveChain,
  getLeafMatch,
  syncChainHref,
  buildMatchedChain,
} from './matched-chain';

export {
  findBranchLcaIndex,
  findLca,
  findLcaNodes,
  buildExitRoutes,
  buildEnterRoutes,
} from './branch-diff';

export { buildTransitionPlan, getEnterRoute } from './transition-plan';

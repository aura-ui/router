import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteInstance } from '../route/types';
import {
  buildEnterRoutes,
  buildExitRoutes,
  findBranchLcaIndex,
} from './branch-diff';
import { getActiveChain, getLeafMatch, isSameRouteMatch } from './matched-chain';

/**
 * План перехода между двумя match-состояниями: какие ветки деактивировать/активировать.
 * Branch diff (exit/enter routes) — не {@link ../../../aura-route/core/attr/transition-order-attr-parser!TransitionOrderType | view effect order}.
 */
export interface TransitionMap {
  /** Узлы для deactivate, leaf → root (LCA не входит). */
  exitRoutes: MatchedRouteInfo[];
  /** Узлы для activate, root → leaf (LCA не входит). */
  enterRoutes: MatchedRouteInfo[];
  /** Lowest common ancestor; `null` при cold enter или полной смене ветки. */
  lca: MatchedRouteInfo | null;
  /** `true` — update shortcut (тот же leaf, без leave/guard/render). */
  update: boolean;
  /**
   * Synthetic param remount на том же leaf `<aura-route>`: render enter уже заменил DOM.
   * Controller в `onUnmount` не трогает active view; `unmount="…"` hooks на exitRoutes остаются.
   */
  paramChangeRemount?: boolean;
}

/**
 * Конечный `<aura-route>` enter-ветки (content leaf).
 * @example enter [settings, profile] → route profile
 */
export function getEnterRoute(plan: TransitionMap): MatchedRouteInfo['route'] | undefined {
  const enterRoutes = plan.enterRoutes;
  return enterRoutes[enterRoutes.length - 1]?.route;
}

/**
 * Строит {@link TransitionMap} для navigation processor.
 *
 * @param from — текущий committed match; `null` при cold enter
 * @param to — целевой match после matchPath
 * @returns exit/enter ветки, LCA и флаг update shortcut
 *
 * @example null → profile: enter [settings, profile], exit []
 * @example profile → security: exit [profile], enter [security], lca settings
 * @example profile → profile?tab=2 (same leaf): update true
 * @example /users/1 → /users/2 (same leaf, same view key): update true
 * @example /users/1 → /users/2 (same leaf, per-id view ref): update false, synthetic remount
 */
export function buildTransitionPlan(from: MatchedRouteInfo | null, to: MatchedRouteInfo): TransitionMap {
  if (!from) {
    return {
      exitRoutes: [],
      enterRoutes: getActiveChain(to),
      lca: null,
      update: false,
    };
  }

  const fromLeaf = getLeafMatch(from);
  const toLeaf = getLeafMatch(to);

  if (isSameRouteMatch(fromLeaf, toLeaf)) {
    return buildSameRecordPlan(fromLeaf, toLeaf);
  }

  const fromChain = getActiveChain(from);
  const toChain = getActiveChain(to);
  const lcaIndex = findBranchLcaIndex(fromChain, toChain);

  return {
    exitRoutes: buildExitRoutes(fromChain, lcaIndex),
    enterRoutes: buildEnterRoutes(toChain, lcaIndex),
    lca: lcaIndex >= 0 ? fromChain[lcaIndex]! : null, // NOTE: in future for incremental render vs data cache
    update: false,
  };
}

/**
 * Режим param-change для того же leaf: update shortcut или synthetic remount.
 * Учитывает `param-change` attr и совпадение `viewKey` (auto по умолчанию).
 */
function resolveParamChangeMode(fromLeaf: MatchedRouteInfo, toLeaf: MatchedRouteInfo): 'update' | 'navigate' {
  const mode = toLeaf.route.paramChange as RouteInstance['paramChange'];
  if (mode === 'navigate') return 'navigate';

  const fromKey = fromLeaf.resolvedView?.viewKey ?? null;
  const toKey = toLeaf.resolvedView?.viewKey ?? null;

  if (mode === 'update') {
    if (fromKey && toKey && fromKey !== toKey) {
      console.warn(
        `[aura-router] param-change="update" with different viewKey (${fromKey} → ${toKey}): `
        + 'UPDATE shortcut skips render — stale HTML risk. Omit param-change or use param-change="navigate".',
      );
    }
    return 'update';
  }

  if (fromKey === null || toKey === null) return 'update';
  return fromKey === toKey ? 'update' : 'navigate';
}

/**
 * План для того же route record (тот же leaf `RouteNode`): update или synthetic exit/enter leaf.
 * Pathname/search/params могут отличаться.
 */
function buildSameRecordPlan(fromLeaf: MatchedRouteInfo, toLeaf: MatchedRouteInfo): TransitionMap {
  if (resolveParamChangeMode(fromLeaf, toLeaf) === 'update') {
    return {
      exitRoutes: [],
      enterRoutes: [toLeaf],
      lca: toLeaf,
      update: true,
    };
  }

  const chain = getActiveChain(fromLeaf);
  const parentIndex = chain.length - 2;
  return {
    exitRoutes: [fromLeaf],
    enterRoutes: [toLeaf],
    lca: parentIndex >= 0 ? chain[parentIndex]! : null,
    update: false,
    paramChangeRemount: true,
  };
}

/**
 * Точное совпадение navigation slice для dedupe и history: pathname + search + leaf.
 * Hash не сравнивается — hash-only навигации обходят transaction в engine.
 *
 * @example `/settings/profile` → `/settings/profile` → true
 * @example `/users?q=1` → `/users?q=2` → false
 */
export function isSameNavigationTarget(from: MatchedRouteInfo, to: MatchedRouteInfo): boolean {
  if (from.pathname !== to.pathname || from.search !== to.search) return false;
  return isSameRouteMatch(getLeafMatch(from), getLeafMatch(to));
}

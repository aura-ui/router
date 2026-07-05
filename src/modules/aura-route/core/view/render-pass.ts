import type { MatchedRouteInfo } from '../../../aura-routing-engine/route-api';
import type { AuraRouteInterface } from '../types';

import type { ViewKind } from './ports';
import { cacheKey } from './view-cache';

export type RenderPass = {
  readonly id: number;
  readonly routeInfo: MatchedRouteInfo;
  readonly signal: AbortSignal;
  readonly cacheKey: string;
  readonly viewKind: ViewKind;
  readonly useStagedMount: boolean;
  /** Load-hook payload from DataGraph snapshot. */
  readonly data?: unknown;
};

export function createRenderPass(
  passId: number,
  route: AuraRouteInterface,
  routeInfo: MatchedRouteInfo,
  signal: AbortSignal,
  data?: unknown,
  paramChangeRemount?: boolean,
): RenderPass {
  const useStagedMount = route.transition.order !== null
    || (paramChangeRemount === true && route.preserve.view);

  return {
    id: passId,
    routeInfo,
    signal,
    cacheKey: cacheKey(routeInfo, route.path),
    viewKind: route.layout.trim() ? 'layout' : 'content',
    useStagedMount,
    ...(data !== undefined && { data }),
  };
}

export function isStale(
  pass: RenderPass,
  currentPassId: () => number,
  aborted: () => boolean,
): boolean {
  return aborted() || currentPassId() !== pass.id;
}

import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
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
};

export function createRenderPass(
  passId: number,
  route: AuraRouteInterface,
  routeInfo: MatchedRouteInfo,
  signal: AbortSignal,
): RenderPass {
  return {
    id: passId,
    routeInfo,
    signal,
    cacheKey: cacheKey(routeInfo, route.path),
    viewKind: route.layout.trim() ? 'layout' : 'content',
    useStagedMount: route.getResolvedTransition().order !== null,
  };
}

export function isStale(
  pass: RenderPass,
  currentPassId: () => number,
  aborted: () => boolean,
): boolean {
  return aborted() || currentPassId() !== pass.id;
}

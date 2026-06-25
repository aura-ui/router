import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { AuraRouteInterface } from '../core/types';
import type { ViewKind } from './ports';
import { stashKey } from './stash';

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
    cacheKey: stashKey(routeInfo, route.path),
    viewKind: route.layout ? 'layout' : 'content',
    useStagedMount: Boolean(route.crossfade),
  };
}

export function isStale(
  pass: RenderPass,
  currentPassId: () => number,
  aborted: () => boolean,
): boolean {
  return aborted() || currentPassId() !== pass.id;
}

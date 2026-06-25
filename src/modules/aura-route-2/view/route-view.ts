import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import type { RouteRenderOptions } from '../core/types';
import type { RouteViewConfig } from './ports';
import { RouteViewCoordinator } from './coordinator';

/** Facade for `<aura-route-2>` — pass lifecycle + coordinator. */
export class RouteView {
  private readonly coordinator: RouteViewCoordinator;
  private lastCacheKey: string | null = null;

  constructor(config: RouteViewConfig, getPassId: () => number) {
    this.coordinator = new RouteViewCoordinator(config, getPassId);
  }

  get nestedOutlet(): AuraOutlet | null {
    return this.coordinator.nestedOutlet;
  }

  get signal(): AbortSignal {
    return this.coordinator.abortSignal;
  }

  async preload(): Promise<void> {
    await this.coordinator.preload();
  }

  async render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const pass = this.coordinator.beginPass(routeInfo, options?.parentSignal);
    this.lastCacheKey = pass.cacheKey;
    await this.coordinator.render(pass);
  }

  commitStagedView(): void {
    this.coordinator.commitStagedView();
  }

  onLeft(): void {
    this.coordinator.onLeft(this.lastCacheKey);
  }

  cancel(): void {
    this.coordinator.cancel();
  }

  cancelPendingRender(): void {
    this.coordinator.cancelPendingRender();
  }
}

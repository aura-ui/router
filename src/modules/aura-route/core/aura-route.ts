import { attr, boolAttr } from '../../aura-utils/decorators';
import { parseCommaSeparated } from '../../aura-utils/misc';
import type {
  MatchedRouteInfo,
  RouteErrorContext,
  RouteInstance,
  RouteLifecycleContext,
} from '../../aura-route-hooks/core';
import { AuraRouter } from '../../aura-router/core/aura-router';
import type { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import {
  createAuraRouteViewController,
  type AuraRouteViewController,
  type RouteRenderOptions,
} from './aura-route-view-controller';

export type { RouteRenderOptions };

/** Public surface of `<aura-route>` element attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  source: string;
  content: string;
  loadingTemplate: string;
  errorTemplate: string;
  preload: boolean;
  keepAlive: boolean;
  restoreScroll: boolean;
  cache: boolean;
}

export class AuraRoute extends HTMLElement implements AuraRouteInterface, RouteInstance {
  static is = 'aura-route';

  @attr({ readonly: true }) path: string;
  @attr({ readonly: true }) layout: string;
  @attr({ readonly: true }) source: string;
  @attr({ readonly: true, dataAttr: true }) content: string;

  @attr({ parser: parseCommaSeparated }) enter: string[] | null;
  @attr({ parser: parseCommaSeparated }) transitionIn: string[] | null;
  @attr({ parser: parseCommaSeparated }) load: string[] | null;
  @attr({ parser: parseCommaSeparated }) entered: string[] | null;
  @attr({ parser: parseCommaSeparated }) leave: string[] | null;
  @attr({ parser: parseCommaSeparated }) transitionOut: string[] | null;
  @attr({ parser: parseCommaSeparated }) left: string[] | null;
  @attr({ parser: parseCommaSeparated }) reenter: string[] | null;
  @attr({ parser: parseCommaSeparated }) error: string[] | null;

  @attr({ readonly: true, inherit: true, cached: true }) loadingTemplate: string;
  @attr({ readonly: true, inherit: true, cached: true }) errorTemplate: string;

  @boolAttr({ readonly: true }) preload: boolean;
  @boolAttr({ readonly: true }) keepAlive: boolean;
  @boolAttr({ readonly: true }) restoreScroll: boolean;

  @boolAttr() cache: boolean; //todo add times in seconds how many to store?

  private view!: AuraRouteViewController;

  get resolvedOutlet(): AuraOutlet | null {
    return this.view?.resolvedOutlet ?? null;
  }

  async connectedCallback(): Promise<void> {
    const router = this.parentElement?.closest(AuraRouter.is) as AuraRouter | null;
    if (!router) {
      throw new DOMException('aura-route should be inside aura-router', 'NotFoundError');
    }

    if (!this.path) throw new Error('AuraRoute must have a path attribute');
    if (!this.content && !this.layout) {
      console.warn(`AuraRoute with path "${this.path}" has no content specified`);
    }

    this.view = createAuraRouteViewController(this, () => router.rootOutlet);

    if (this.preload) {
      await this.view.preload().catch(console.error);
    }
  }

  disconnectedCallback(): void {
    this.view?.cancel();
  }

  render(routeInfo?: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    return this.view.render(routeInfo, options);
  }

  cancelPendingRender(): void {
    this.view.cancelPendingRender();
  }

  onEnter(_ctx: RouteLifecycleContext): void {}
  onLoad(_ctx: RouteLifecycleContext): void {}
  onEntered(_ctx: RouteLifecycleContext): void {}
  onLeave(_ctx: RouteLifecycleContext): void {}
  onTransitionOut(_ctx: RouteLifecycleContext): void {}
  onTransitionIn(_ctx: RouteLifecycleContext): void { this.view.onTransitionIn(); }
  onLeft(_ctx: RouteLifecycleContext): void { this.view.onLeft(); }
  onReenter(ctx: RouteLifecycleContext): void { this.view.onReenter(ctx.to); }
  onError(_ctx: RouteErrorContext): void {}
}

import { attr, boolAttr } from '../../aura-utils/decorators';
import { parseCommaSeparated } from '../../aura-utils/misc';
import { AuraRouter } from '../../aura-router/core/aura-router';
import type {
  MatchedRouteInfo,
  RouteErrorContext,
  RouteInstance,
  RouteLifecycleContext,
} from '../../aura-route-hooks/core';
import type { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface, RouteRenderOptions } from './types';
import { RouteContentLoader, resolveRouteContentLoaderService } from './route-content-loader';
import { RouteView } from '../view/route-view';
import { defaultViewStash } from '../view/stash';
import { loadingBodyClass, loadingEvent } from '../view/plugins';
import type { MountTargetPort } from '../view/ports';

export type { RouteRenderOptions, AuraRouteInterface };

export class AuraRoute2 extends HTMLElement implements AuraRouteInterface, RouteInstance {
  static is = 'aura-route-2';

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
  @attr({ readonly: true, inherit: true, cached: true, dataAttr: true }) crossfade: string;

  @boolAttr({ readonly: true }) preload: boolean;
  @boolAttr({ readonly: true }) keepAlive: boolean;
  @boolAttr({ readonly: true }) restoreScroll: boolean;
  @boolAttr() cache: boolean;

  private view!: RouteView;
  private passId = 0;

  get nestedOutlet(): AuraOutlet | null {
    return this.view?.nestedOutlet ?? null;
  }

  async connectedCallback(): Promise<void> {
    const router = this.parentElement?.closest(AuraRouter.is) as AuraRouter | null;
    if (!router) {
      throw new DOMException('aura-route-2 should be inside aura-router', 'NotFoundError');
    }

    if (!this.path) throw new Error('AuraRoute2 must have a path attribute');
    if (!this.content && !this.layout) {
      console.warn(`AuraRoute2 with path "${this.path}" has no content specified`);
    }

    const mountTarget: MountTargetPort = {
      appOutlet: () => router.appOutlet,
      nestedOutlet: (routeInfo) => routeInfo.node?.parent?.route.nestedOutlet ?? null,
    };

    const plugins = [
      ...(this.loadingTemplate ? [loadingBodyClass(), loadingEvent(this)] : []),
    ];

    this.view = new RouteView(
      {
        route: this,
        content: new RouteContentLoader(this, resolveRouteContentLoaderService()),
        stash: defaultViewStash,
        mountTarget,
        plugins,
      },
      () => this.passId,
    );

    if (this.preload) {
      await this.view.preload().catch(console.error);
    }
  }

  disconnectedCallback(): void {
    this.passId++;
    this.view?.cancel();
  }

  render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    this.passId++;
    return this.view.render(routeInfo, options);
  }

  cancelPendingRender(): void {
    this.view.cancelPendingRender();
  }

  commitStagedView(): void {
    this.view.commitStagedView();
  }

  onEnter(_ctx: RouteLifecycleContext): void {}
  onLoad(_ctx: RouteLifecycleContext): void {}
  onEntered(_ctx: RouteLifecycleContext): void {}
  onLeave(_ctx: RouteLifecycleContext): void {}
  onTransitionOut(_ctx: RouteLifecycleContext): void {}
  onTransitionIn(_ctx: RouteLifecycleContext): void {}
  onLeft(_ctx: RouteLifecycleContext): void {
    this.passId++;
    this.view.onLeft();
  }
  onReenter(_ctx: RouteLifecycleContext): void {
    this.passId++;
  }
  onError(_ctx: RouteErrorContext): void {}
}

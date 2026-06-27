import { attr, boolAttr } from '../../aura-utils/decorators';
import { parseCommaSeparated } from '../../aura-utils/misc';
import { parsePreserveAttr, type PreserveFlags } from '../../aura-routing-engine/core/content/preserve';
import { parsePhaseHooks } from '../../aura-routing-engine/core/hooks/phases';
import type {
  PhaseHooksMap,
  RouteErrorContext,
  RouteInstance,
  RouteLifecycleContext,
  RouteTransition,
} from '../../aura-routing-engine/core/hooks/types';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core';
import { AuraRouter } from '../../aura-router/core/aura-router';
import type { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface, RouteRenderOptions } from './types';
import { RouteContentLoader } from './route-content-loader';
import { RouteViewController } from './view/view-controller';
import { defaultViewCache } from './view/view-cache';
import { loadingBodyClass, loadingEvent } from './view/plugins';
import type { MountTargetPort } from './view/ports';
import { parseTransitionOrder, type TransitionPolicy } from '../../aura-routing-engine/core/transition/policy';
import {
  buildRouteTransition,
  parseTransitionShortcut,
  type TransitionShortcut,
} from './transition/transition';

export type { RouteRenderOptions, AuraRouteInterface };

export class AuraRoute extends HTMLElement implements AuraRouteInterface, RouteInstance {
  static is = 'aura-route';

  @attr({ readonly: true }) path: string;
  @attr({ readonly: true }) layout: string;
  @attr({ readonly: true }) view: string;

  @attr({ parser: parseCommaSeparated }) enter: string[] | null;
  @attr({ parser: parseCommaSeparated }) load: string[] | null;
  @attr({ parser: parseCommaSeparated, name: 'after' }) afterHook: string[] | null;
  @attr({ parser: parseCommaSeparated }) leave: string[] | null;
  @attr({ parser: parseCommaSeparated }) error: string[] | null;
  @attr({ parser: parsePhaseHooks }) hooks: PhaseHooksMap | null;

  @attr({ readonly: true, inherit: true, cached: true }) loadingTemplate: string;
  @attr({ readonly: true, inherit: true, cached: true }) errorTemplate: string;

  @attr({ readonly: true, inherit: true, allowEmpty: true, name: 'transition', parser: parseTransitionShortcut })
  transitionShortcut: TransitionShortcut | null;
  @attr({ readonly: true, inherit: true, allowEmpty: true, parser: parseTransitionOrder })
  transitionOrder: TransitionPolicy | null;
  @attr({ readonly: true, inherit: true, allowEmpty: true, name: 'transition-in', parser: parseCommaSeparated })
  transitionInDecl: string[] | null;
  @attr({ readonly: true, inherit: true, allowEmpty: true, name: 'transition-out', parser: parseCommaSeparated })
  transitionOutDecl: string[] | null;

  @boolAttr({ readonly: true }) restoreScroll: boolean;
  @attr({ readonly: true, parser: parsePreserveAttr }) preserve: PreserveFlags;

  private viewController!: RouteViewController;
  private passId = 0;
  private setupDone!: Promise<void>;
  private initGeneration = 0;

  get nestedOutlet(): AuraOutlet | null {
    return this.viewController?.nestedOutlet ?? null;
  }

  //todo memoize
  get transition(): RouteTransition {
    return buildRouteTransition({
      optOut: this.hasAttribute('transition') && this.getAttribute('transition') === '',
      order: this.transitionOrder,
      shortcut: this.transitionShortcut,
      inDecl: this.transitionInDecl,
      outDecl: this.transitionOutDecl,
    });
  }

  get transitionIn(): string[] | null {
    return this.transition.in;
  }

  get transitionOut(): string[] | null {
    return this.transition.out;
  }

  connectedCallback() {
    this.initGeneration++;
    const generation = this.initGeneration;
    this.setupDone = this.init(generation);
  }

  private async init(generation: number): Promise<void> {
    await customElements.whenDefined(AuraRouter.is);
    if (generation !== this.initGeneration || !this.isConnected) {
      throw new DOMException('AuraRoute init aborted', 'AbortError');
    }

    const router = this.closest(AuraRouter.is) as AuraRouter | null;
    if (!router) {
      throw new DOMException('aura-route should be inside aura-router', 'NotFoundError');
    }

    if (!this.path) throw new Error('AuraRoute must have a path attribute');
    if (!this.view && !this.layout) {
      console.warn(`AuraRoute with path "${this.path}" has no view or layout specified`);
    }

    const mountTarget: MountTargetPort = {
      appOutlet: () => router.appOutlet,
      nestedOutlet: (routeInfo) => routeInfo.node?.parent?.route.nestedOutlet ?? null,
    };

    const plugins = [
      ...(this.loadingTemplate ? [loadingBodyClass(), loadingEvent(this)] : []),
    ];

    this.viewController = new RouteViewController(
      {
        route: this,
        content: new RouteContentLoader(this, router.contentLoad),
        cache: defaultViewCache,
        mountTarget,
        plugins,
      },
      () => this.passId,
    );
  }

  disconnectedCallback(): void {
    this.passId++;
    this.initGeneration++;
    this.viewController?.cancel();
  }

  render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    return this.setupDone.then(() => {
      this.passId++;
      return this.viewController.render(routeInfo, options);
    });
  }

  cancelPendingRender(): void {
    this.viewController?.cancelPendingRender();
  }

  commitStagedView(): void {
    this.viewController?.commitStagedView();
  }

  onEnter(_ctx: RouteLifecycleContext): void {}
  onLoad(_ctx: RouteLifecycleContext): void {}
  onAfter(_ctx: RouteLifecycleContext): void {}
  onLeave(_ctx: RouteLifecycleContext): void {}
  onTransitionOut(_ctx: RouteLifecycleContext): void {}
  onTransitionIn(_ctx: RouteLifecycleContext): void {}
  onLeft(_ctx: RouteLifecycleContext): void {
    this.passId++;
    this.viewController?.onLeft();
  }
  onReenter(_ctx: RouteLifecycleContext): void {
    this.passId++;
  }
  onError(_ctx: RouteErrorContext): void {}
}

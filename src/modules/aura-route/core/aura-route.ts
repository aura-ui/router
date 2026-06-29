import type { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRouter } from '../../aura-router/core/aura-router';
import {
  parsePreserveAttr,
  parseScrollPolicy,
  type MatchedRouteInfo,
  type PreserveFlags,
  type RouteErrorContext,
  type RouteInstance,
  type RouteLifecycleContext,
  type ScrollPolicy,
  type ViewRenderResult,
} from '../../aura-routing-engine/route-api';
import { attr } from '../../aura-utils/decorators';
import { parseCommaSeparated } from '../../aura-utils/misc';

import { parseViewAttr, type ViewAttrDescriptor } from './attr/view-attr-parser';

import type { AuraRouteInterface, RouteRenderOptions } from './types';
import { loadingBodyClass, loadingEvent } from './view/plugins';
import type { MountTargetPort } from './view/ports';
import { defaultViewCache } from './view/view-cache';
import { RouteViewController } from './view/view-controller';
import {
  NO_TRANSITION,
  parseTransitionShortcutAttr,
  type RouteTransitionType,
  type TransitionShortcutType,
} from './attr/transition-attr-parser';
import {
  DEFAULT_TRANSITION_ORDER,
  parseTransitionOrder,
  type TransitionOrderType,
} from './attr/transition-order-attr-parser';

export type { RouteRenderOptions, AuraRouteInterface };

export class AuraRoute extends HTMLElement implements AuraRouteInterface, RouteInstance {
  static is = 'aura-route';

  @attr({ readonly: true }) path: string;
  @attr({ readonly: true }) layout: string;
  @attr({ readonly: true, parser: parseViewAttr, cached: true }) view: ViewAttrDescriptor | null;

  @attr({ parser: parseCommaSeparated, inherit: true, allowEmpty: true }) enter: string[] | null;
  @attr({ parser: parseCommaSeparated, inherit: true, allowEmpty: true }) load: string[] | null;
  @attr({ parser: parseCommaSeparated, name: 'after', inherit: true, allowEmpty: true }) afterHook: string[] | null;
  @attr({ parser: parseCommaSeparated, inherit: true, allowEmpty: true }) leave: string[] | null;
  @attr({ parser: parseCommaSeparated, inherit: true, allowEmpty: true }) error: string[] | null;
  @attr({ parser: parseCommaSeparated, inherit: true, allowEmpty: true }) left: string[] | null;
  @attr({ parser: parseCommaSeparated, inherit: true, allowEmpty: true }) reenter: string[] | null;

  @attr({ readonly: true, inherit: true, cached: true, allowEmpty: true }) loadingTemplate: string;
  @attr({ readonly: true, inherit: true, cached: true, allowEmpty: true }) errorTemplate: string;

  @attr({ readonly: true, inherit: true, allowEmpty: true, name: 'transition', parser: parseTransitionShortcutAttr })
  transitionShortcut: TransitionShortcutType | null;
  @attr({ inherit: true, allowEmpty: true, parser: parseTransitionOrder })
  transitionOrder: TransitionOrderType | null;
  @attr({ readonly: true, inherit: true, allowEmpty: true, name: 'transition-in', parser: parseCommaSeparated })
  transitionInDecl: string[] | null;
  @attr({ readonly: true, inherit: true, allowEmpty: true, name: 'transition-out', parser: parseCommaSeparated })
  transitionOutDecl: string[] | null;

  @attr({
    readonly: true,
    inherit: true,
    allowEmpty: true,
    cached: true,
    name: 'scroll',
    parser: parseScrollPolicy,
  })
  scrollPolicy: ScrollPolicy | null;

  @attr({ readonly: true, parser: parsePreserveAttr }) preserve: PreserveFlags;

  private viewController!: RouteViewController;
  private passId = 0;
  private setupDone!: Promise<void>;
  private initGeneration = 0;

  get nestedOutlet(): AuraOutlet | null {
    return this.viewController?.nestedOutlet ?? null;
  }

  transition: RouteTransitionType = NO_TRANSITION;

  /** Merges decl attrs with `transition` shortcut; `[]` on decl opts out of inherited shortcut on that side. */
  initTransition(): RouteTransitionType {
    const inMerged = this.transitionInDecl ?? this.transitionShortcut?.in;
    const outMerged = this.transitionOutDecl ?? this.transitionShortcut?.out;
    const inHooks = inMerged?.length ? inMerged : null;
    const outHooks = outMerged?.length ? outMerged : null;
    if (!this.transitionOrder && !inHooks && !outHooks) return NO_TRANSITION;
    const order = this.transitionOrder ?? DEFAULT_TRANSITION_ORDER;
    return { order: order, in: inHooks, out: outHooks };
  }

  get transitionIn(): string[] | null {
    return this.transition.in;
  }

  get transitionOut(): string[] | null {
    return this.transition.out;
  }

  get hasLayout(): boolean {
    return !!this.layout.trim();
  }

  get hasEnter(): boolean {
    return !!this.enter?.length;
  }

  get hasLeave(): boolean {
    return !!this.leave?.length;
  }

  get hasLoad(): boolean {
    return !!this.load?.length;
  }

  get hasTransitionIn(): boolean {
    return !!this.transitionIn;
  }

  get hasPostEffects(): boolean {
    return !!this.transitionOut || !!this.afterHook?.length;
  }

  get hasAsyncContent(): boolean {
    if (this.hasLoad) return true;
    const type = this.view?.type;
    return type === 'html-src' || type === 'component-src';
  }

  connectedCallback() {
    this.initGeneration++;
    const generation = this.initGeneration;
    this.transition = this.initTransition();
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
        content: router.contentLoad,
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

  render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<ViewRenderResult> {
    return this.setupDone.then(() => {
      this.passId++;
      return this.viewController.render(routeInfo, options);
    });
  }

  revertInFlightView(): void {
    this.viewController?.revertInFlightView();
  }

  commitStagedView(): void {
    this.viewController?.commitStagedView();
  }

  onEnter(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onLoad(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onAfter(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onLeave(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onTransitionOut(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onTransitionIn(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onLeft(ctx: RouteLifecycleContext): void {
    void ctx;
    this.passId++;
    this.viewController?.onLeft();
  }

  onReenter(ctx: RouteLifecycleContext): void {
    void ctx;
    this.passId++;
  }

  onError(ctx: RouteErrorContext): void {
    void ctx;
  }
}

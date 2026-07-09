import type { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRouter } from '../../aura-router/core/aura-router';
import {
  type MatchedRouteInfo,
  type RouteErrorContext,
  type RouteInstance,
  type RouteLifecycleContext,
  type ViewRenderResult,
} from '../../aura-routing-engine/route-api';
import { parsePreserveAttr, type PreserveFlags } from './attr/preserve-attr-parser';
import { routeAttr } from '../../aura-utils/decorators';
import { parseCommaSeparated, parseNullableString } from '../../aura-utils/misc';
import { isAsyncLoader, parseViewAttr, type ViewAttrDescriptor } from './attr/view-attr-parser';
import type { AuraRouteInterface, RouteRenderOptions, ApplyPreResolvedOptions } from './types';
import { loadingBodyClass, loadingEvent } from './plugins/view-loading-plugins';
import type { MountTargetPort } from './view';
import { cacheKey, defaultViewCache } from './view/view-cache';
import { RouteViewController } from './view';
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
import { parseMountStrategyAttr, type MountStrategy } from './attr/mount-strategy-attr-parser';
import { parsePrefetchAttr, type PrefetchType } from './attr/prefetch-attr-parser';
import { parseScrollAttr, type ScrollAttr } from './attr/scroll-attr-parser';
import { parseParamChangeAttr, type ParamChangePolicy } from './attr/param-change-attr-parser';
import { memoize } from '../../aura-utils/decorators/memoize';

export type { RouteRenderOptions, ApplyPreResolvedOptions, AuraRouteInterface };

export class AuraRoute extends HTMLElement implements AuraRouteInterface, RouteInstance {
  static is = 'aura-route';

  @routeAttr({ inherit: false }) path: string;
  @routeAttr({ inherit: false, cached: false }) layout: string;
  @routeAttr() loadingTemplate: string;
  @routeAttr() errorTemplate: string;

  @routeAttr({ inherit: false, parser: parseViewAttr }) view: ViewAttrDescriptor | null;
  @routeAttr({ parser: parseNullableString }) extract: string | null;

  @routeAttr({ parser: parseCommaSeparated }) guard: string[] | null;
  @routeAttr({ parser: parseCommaSeparated }) load: string[] | null;
  @routeAttr({ parser: parseCommaSeparated }) unmount: string[] | null;
  @routeAttr({ parser: parseCommaSeparated }) ready: string[] | null;
  @routeAttr({ parser: parseCommaSeparated }) update: string[] | null;
  @routeAttr({ parser: parseCommaSeparated }) leave: string[] | null;
  @routeAttr({ parser: parseCommaSeparated }) error: string[] | null;
  @routeAttr({ parser: parseParamChangeAttr }) paramChange: ParamChangePolicy | null;

  @routeAttr({
    parser: parseTransitionShortcutAttr,
    name: 'transition',
  }) transitionShortcut: TransitionShortcutType | null;
  @routeAttr({ parser: parseTransitionOrder }) transitionOrder: TransitionOrderType | null;
  @routeAttr({ parser: parseCommaSeparated, name: 'transition-in' }) transitionInDecl: string[] | null;
  @routeAttr({ parser: parseCommaSeparated, name: 'transition-out' }) transitionOutDecl: string[] | null;

  @routeAttr({ parser: parseScrollAttr, name: 'scroll' }) scrollPolicy: ScrollAttr | null;
  @routeAttr({ parser: parsePrefetchAttr }) prefetch: PrefetchType | false | null;
  @routeAttr({ parser: parseMountStrategyAttr }) mountStrategy: MountStrategy | null;
  @routeAttr({ parser: parsePreserveAttr }) preserve: PreserveFlags;

  private viewController!: RouteViewController;
  private passId = 0;
  private setupDone!: Promise<void>;
  private viewReady = false;
  private initGeneration = 0;

  get nestedOutlet(): AuraOutlet | null {
    return this.viewController?.nestedOutlet ?? null;
  }

  protected attributeChangedCallback(_attrName: string, _oldVal: string, _newVal: string): void {
    this.refresh();
  }

  refresh() {
    routeAttr.clear(this);
    memoize.clear(this, 'transition');
  }

  @memoize()
  get transition() {
    return this.initTransition();
  }

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

  connectedCallback() {
    // this.refresh();
    this.initGeneration++;
    const generation = this.initGeneration;
    this.viewReady = false;
    this.setupDone = this.init(generation);
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

  get hasViewContent(): boolean {
    return this.hasLayout || !!this.view;
  }

  get hasGuard(): boolean {
    return !!this.guard?.length;
  }

  get hasUpdate(): boolean {
    return !!this.update?.length;
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

  get hasReady(): boolean {
    return !!this.transitionOut || !!this.ready?.length;
  }

  get hasAsyncContent(): boolean {
    if (this.hasLoad) return true;
    return isAsyncLoader(this.view?.loader);
  }

  /** Inline `html::` without layout, fetch loaders, or loading UI — future sync render lane (see IMPLEMENTATION_STEPS §5b PR3). */
  get hasSyncContent(): boolean {
    if (this.hasLayout || this.hasAsyncContent) return false;
    if (this.loadingTemplate.trim()) return false;
    return this.view?.loader === 'html';
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
        view: router.viewGraph,
        cache: defaultViewCache,
        mountTarget,
        plugins,
      },
      () => this.passId,
    );
    this.viewReady = true;
  }

  disconnectedCallback(): void {
    this.passId++;
    this.initGeneration++;
    this.viewReady = false;
    this.viewController?.cancel();
  }

  render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<ViewRenderResult> {
    return this.setupDone.then(() => {
      this.throwIfInvalidAttrs();
      this.passId++;
      return this.viewController.render(routeInfo, options);
    });
  }

  /** Sync branch-atomic mount — caller must finish branch resolve first. */
  applyPreResolved(
    routeInfo: MatchedRouteInfo,
    options: ApplyPreResolvedOptions,
  ): ViewRenderResult | 'aborted' {
    if (!this.viewReady || !this.viewController) {
      return { status: 'error', error: new DOMException('AuraRoute not initialized', 'InvalidStateError') };
    }
    this.throwIfInvalidAttrs();
    this.passId++;
    return this.viewController.applyPreResolved(routeInfo, options);
  }

  revertInFlightView(): void {
    this.viewController?.revertInFlightView();
  }

  commitStagedView(): void {
    this.viewController?.commitStagedView();
  }

  onGuard(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onLoad(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onReady(ctx: RouteLifecycleContext): void {
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

  onUnmount(ctx: RouteLifecycleContext): void {
    this.passId++;
    this.viewController?.onUnmount({ cacheKey: cacheKey(ctx.to, this.path) });
  }

  onUpdate(ctx: RouteLifecycleContext): void {
    void ctx;
    this.passId++;
  }

  onError(ctx: RouteErrorContext): void {
    void ctx;
  }

  private throwIfInvalidAttrs(): void {
    if (!this.view && !this.layout.trim()) {
      throw new Error(`AuraRoute with path "${this.path}" has no view or layout to render`);
    }
  }
}

import { attr, boolAttr } from '../../aura-utils/decorators';
import { getTemplate, parseCommaSeparated } from '../../aura-utils/misc';
import {
  ContentLoaderRegistry,
  ContentLoaderService,
  type LoaderConstructor,
} from '../../aura-content-loaders/core';
import type { RouteInstance } from '../../aura-route-hooks/core';
import type { MatchedRouteInfo, RouteErrorContext, RouteLifecycleContext } from '../../aura-route-hooks/core';
import { AuraRouter } from '../../aura-router/core/aura-router';
import type { AuraOutlet, ViewHandle } from '../../aura-outlet/core/aura-outlet';
import { RouteRenderSignal } from './render-signal';
import { RouteView, type RenderMode, type RouteMountState } from './route-view';

export interface AURARouteConfigureOptions {
  contentLoaderService?: ContentLoaderService;
}

export interface AURARouteInterface {
  path: string;
  html?: string;
  htmlSrc?: string;
  component?: string;
  componentSrc?: string;
  template?: string;
  loadingTemplate?: string;
  errorTemplate?: string;
  preload?: boolean;
  preserveState?: boolean;
  cache?: boolean;
}

type AuraRouteGuards = 'leave' | 'enter' | 'load';
type AuraRouteTransitionEffects = 'transitionIn' | 'transitionOut';
type AuraRoutePostShowEffects = 'left' | 'entered';

export interface AuraRouteInfo {
  path: string;
  guards: Record<AuraRouteGuards, string[]>;
  transitions: Record<AuraRouteTransitionEffects, string[]>;
  postShow: Record<AuraRoutePostShowEffects, string[]>;
}

// AURARoute.setDefaultOptions({
//   reserveState: true, // значения по умолчанию для всех маршрутов
// })

let sharedContentLoaderService: ContentLoaderService | undefined;

export class AURARoute extends HTMLElement implements AURARouteInterface, RouteInstance {
  static is = 'aura-route';

  static configure(options: AURARouteConfigureOptions): void {
    if (options.contentLoaderService) {
      sharedContentLoaderService = options.contentLoaderService;
    }
  }

  static registerLoader(type: string, loaderClass: LoaderConstructor): void {
    ContentLoaderRegistry.register(type, loaderClass);
  }

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
  @boolAttr({ readonly: true }) preserveState: boolean;
  @boolAttr({ readonly: true }) restoreScroll: boolean;

  // cache-timeout
  @boolAttr() cache: boolean; //todo add times in seconds how many to store?

  private isActive: boolean;

  private cachedContent: Node | string;

  private readonly renderSignal = new RouteRenderSignal();

  private cachedHtml: string;

  private router: AuraRouter;

  private activeHandle: ViewHandle | null = null;

  /** Nested `<aura-outlet>` inside mounted layout; children render here. */
  resolvedOutlet: AuraOutlet | null = null;

  // private cachedTemplate: HTMLTemplateElement

  private static resolveContentLoaderService(): ContentLoaderService {
    sharedContentLoaderService ??= new ContentLoaderService(false);
    return sharedContentLoaderService;
  }

  async connectedCallback(): Promise<void> {
    // this.cachedTemplate = document.createElement('template')
    // call them for executing getters decorators before routes will be unmount from DOM
    // this.loadingTemplate
    // this.errorTemplate

    this.router = this.parentElement?.closest(AuraRouter.is) as AuraRouter;

    if (!this.router) {
      throw new DOMException(
        'aura-route should be inside aura-router',
        'NotFoundError',
      );
    }

    this.validateAttributes();
    // todo Retry-механизмы для загрузки контента.
    if (this.preload) {
      try {
        await this.preloadContent();

      } catch (error) {
        console.error(error);
      }
      // todo clean on attr change
    }
  }

  private validateAttributes(): void {
    if (!this.path) {
      throw new Error('AURARoute must have a path attribute');
    }
    if (!this.content && !this.layout) {
      console.warn(`AURARoute with path "${this.path}" has no content specified`);
    }
  }

  get guards(): Record<AuraRouteGuards, string[]> {
    const result = {} as Record<AuraRouteGuards, string[]>;
    this.leave && (result.leave = this.leave);
    this.enter && (result.enter = this.enter);
    this.load && (result.load = this.load);
    return result;
  }

  get preRendersEffects() {
    return {};
  }

  get postRendersEffects() {
    return {};
  }

  disconnectedCallback(): void {
    this.renderSignal.cancel();
    /*if (!this.preserveState) {
      this.textContent = '';
    }
    if (this.renderDebounce) {
      clearTimeout(this.renderDebounce);
    }*/
  }

  protected async preloadContent() {
    // todo
    // if (this.componentSrc) return await loadAndRegisterComponent(this.componentSrc);
    // if (this.htmlSrc) return await this.loadHtml();
  }

  public async render(routeInfo?: MatchedRouteInfo, parentSignal?: AbortSignal): Promise<void> {
    const mode = RouteView.modeFrom(this.layout);

    try {
      this.isActive = true;
      this.renderSignal.begin(parentSignal);

      if (RouteView.shouldSkip(this.preserveState, mode, this.mountState)) return;

      if (this.loadingTemplate) {
        this.show(getTemplate(this.loadingTemplate), routeInfo, mode);
      }

      const payload = await this.resolvePayload(mode, routeInfo);

      if (this.renderSignal.aborted) return;

      if (mode === 'content' && !payload) {
        this.show('<div>No content to display</div>', routeInfo, mode);
        return;
      }

      this.show(payload!, routeInfo, mode);
    } catch (error) {
      if (this.renderSignal.aborted) return;

      if (this.errorTemplate) {
        try {
          this.show(getTemplate(this.errorTemplate), routeInfo, 'content');
        } catch (templateError) {
          console.warn(`Failed to render errorTemplate for route "${this.path}":`, templateError);
          this.handleRenderError(error);
        }
      } else {
        this.handleRenderError(error);
      }

      throw error;
    }
  }

  private get mountState(): RouteMountState {
    return { activeHandle: this.activeHandle, resolvedOutlet: this.resolvedOutlet };
  }

  private mountContext(routeInfo?: MatchedRouteInfo) {
    return {
      router: this.router,
      routeInfo,
      signal: this.renderSignal.signal,
      layoutMeta: this.layout ? { templateId: this.layout, path: this.path } : undefined,
    };
  }

  /** Sync step: put ready payload into outlet. */
  private show(payload: Node | string, routeInfo: MatchedRouteInfo | undefined, mode: RenderMode): void {
    if (!this.isActive) return;
    this.assignMountState(
      RouteView.mount(this.mountContext(routeInfo), payload, mode, this.mountState),
    );
  }

  private assignMountState(state: RouteMountState): void {
    this.activeHandle = state.activeHandle;
    this.resolvedOutlet = state.resolvedOutlet;
  }

  private async resolvePayload(mode: RenderMode, routeInfo?: MatchedRouteInfo): Promise<Node | string | null> {
    if (mode === 'layout') return getTemplate(this.layout);
    return this.loadContent(routeInfo);
  }

  protected async loadContent(routeInfo?: MatchedRouteInfo): Promise<Node | string> {
    // todo add static, cached loaders loader
    const loader = ContentLoaderRegistry.create(this.source, AURARoute.resolveContentLoaderService());

    try {
      return await loader.load(this.content, {
        signal: this.renderSignal.signal,
        componentOptions: this.buildComponentOptions(routeInfo),
      });
    } catch (error: unknown) {
      if (this.renderSignal.aborted) return '';

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${loader.type} content for route ${this.path}: ${message}`);
    }
  }

  private buildComponentOptions(routeInfo?: MatchedRouteInfo): Record<string, unknown> {
    if (!routeInfo) return {};

    const options: Record<string, unknown> = {
      url: routeInfo.url,
      routePath: routeInfo.routePath,
    };

    if (routeInfo.params) options.params = routeInfo.params;
    if (routeInfo.query) options.query = routeInfo.query;

    return options;
  }

  /** Abort in-flight content load for the current render. */
  cancelPendingRender(): void {
    this.renderSignal.cancel();
  }

  public onEnter(_ctx: RouteLifecycleContext): void {
  }

  public onTransitionIn(_ctx: RouteLifecycleContext): void {
  }

  public onLoad(_ctx: RouteLifecycleContext): void {
  }

  public onEntered(_ctx: RouteLifecycleContext): void {
  }

  public onLeave(_ctx: RouteLifecycleContext): void {
  }

  public onTransitionOut(_ctx: RouteLifecycleContext): void {
  }

  public onLeft(_ctx: RouteLifecycleContext): void {
    this.isActive = false;
    this.renderSignal.cancel();
    RouteView.unmount(this.activeHandle, this.preserveState);
    this.activeHandle = null;
    if (this.layout) this.resolvedOutlet = null;
  }

  public onReenter(_ctx: RouteLifecycleContext): void {
  }

  public onError(_ctx: RouteErrorContext): void {
  }

  /*
  \
    protected async loadHtml(): Promise<string> {
      if (this.cachedHtml) return this.cachedHtml;
      this.renderSignal.begin();
      const signal = this.renderSignal.signal;
      this.cachedHtml = await loadContent(`${window.location.origin}/${this.htmlSrc}`, signal);
      return this.cachedHtml;
    }
  */

  private handleRenderError(error: unknown): void {
    console.error(`Error rendering AURARoute (path: ${this.path}):`, error);

    if (!this.isActive) return;

    let errorMessage = 'Error loading content';
    let stackTrace = '';

    if (error instanceof Error) {
      errorMessage = error.message;
      stackTrace = error.stack || '';
    }

    this.show(
      `<div class="aura-route-error">
      <h2>Content Loading Error</h2>
      <p>${errorMessage}</p>
      ${stackTrace ? `<pre class="error-stack">${stackTrace}</pre>` : ''}
    </div>`,
      undefined,
      'content',
    );
  }
}

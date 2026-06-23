import { attr, boolAttr } from '../../aura-utils/decorators';
import { getTemplate, parseCommaSeparated } from '../../aura-utils/misc';
import {
  ContentLoaderRegistry,
  ContentLoaderService,
  type LoaderConstructor,
} from '../../aura-content-loaders/core';
import type {
  MatchedRouteInfo,
  RouteErrorContext,
  RouteInstance,
  RouteLifecycleContext,
} from '../../aura-route-hooks/core';
import { AuraRouter } from '../../aura-router/core/aura-router';
import type { AuraOutlet, ViewHandle } from '../../aura-outlet/core/aura-outlet';
import { RouteRenderSignal } from './render-signal';
import { RouteMount, type RouteMountContext, type RouteMountType, type RouteMountResult } from './route-mount';

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
  keepAlive?: boolean;
  cache?: boolean;
}

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
  @boolAttr({ readonly: true }) keepAlive: boolean;
  @boolAttr({ readonly: true }) restoreScroll: boolean;

  @boolAttr() cache: boolean; //todo add times in seconds how many to store?

  private isActive: boolean;

  private readonly renderSignal = new RouteRenderSignal();

  private router: AuraRouter;

  private activeHandle: ViewHandle | null = null;

  /** Nested `<aura-outlet>` inside mounted layout; children render here. */
  resolvedOutlet: AuraOutlet | null = null;

  private static resolveContentLoaderService(): ContentLoaderService {
    sharedContentLoaderService ??= new ContentLoaderService(false);
    return sharedContentLoaderService;
  }

  async connectedCallback(): Promise<void> {
    this.router = this.parentElement?.closest(AuraRouter.is) as AuraRouter;

    if (!this.router) {
      throw new DOMException(
        'aura-route should be inside aura-router',
        'NotFoundError',
      );
    }

    this.validateAttributes();

    if (this.preload) {
      try {
        await this.preloadContent();
      } catch (error) {
        console.error(error);
      }
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

  disconnectedCallback(): void {
    this.renderSignal.cancel();
  }

  protected async preloadContent() {
    // todo
  }

  public async render(routeInfo?: MatchedRouteInfo, parentSignal?: AbortSignal): Promise<void> {
    try {
      this.isActive = true;
      this.renderSignal.begin(parentSignal);

      if (RouteMount.shouldSkipRender(this.keepAlive, this.mountType, this.previousMount)) return;

      if (this.loadingTemplate) {
        this.show(getTemplate(this.loadingTemplate), routeInfo);
      }

      const payload = await this.resolvePayload(routeInfo);
      if (this.renderSignal.aborted) return;

      if (this.mountType === 'content' && !payload) {
        this.show('<div>No content to display</div>', routeInfo);
        return;
      }

      this.show(payload!, routeInfo);
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

  private get mountType(): RouteMountType {
    return this.layout ? 'layout' : 'content';
  }

  private get previousMount(): RouteMountResult {
    return { activeHandle: this.activeHandle, resolvedOutlet: this.resolvedOutlet };
  }

  private mountContext(routeInfo?: MatchedRouteInfo): RouteMountContext {
    return {
      appOutlet: this.router.rootOutlet,
      routePath: routeInfo?.routePath,
      parentResolvedOutlet: routeInfo?.node?.parent?.route.resolvedOutlet ?? null,
      signal: this.renderSignal.signal,
    };
  }

  /** Sync step: put ready payload into outlet. */
  private show(
    payload: Node | string,
    routeInfo?: MatchedRouteInfo,
    mountType: RouteMountType = this.mountType,
  ): void {
    if (!this.isActive) return;

    const result = RouteMount.mount(
      this.mountContext(routeInfo),
      payload,
      this.previousMount,
    );

    this.activeHandle = result.activeHandle;
    this.resolvedOutlet = result.resolvedOutlet;

    if (mountType === 'layout' && !result.resolvedOutlet) {
      console.warn(
        `AURARoute layout "${this.layout}" (path: ${this.path}) has no <aura-outlet>`,
      );
    }
  }

  private async resolvePayload(routeInfo?: MatchedRouteInfo): Promise<Node | string | null> {
    if (this.mountType === 'layout') return getTemplate(this.layout);
    return this.loadContent(routeInfo);
  }

  protected async loadContent(routeInfo?: MatchedRouteInfo): Promise<Node | string> {
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

    return {
      url: routeInfo.url,
      routePath: routeInfo.routePath,
      ...(routeInfo.params && { params: routeInfo.params }),
      ...(routeInfo.query && { query: routeInfo.query }),
    };
  }

  cancelPendingRender(): void {
    this.renderSignal.cancel();
  }

  public onEnter(_ctx: RouteLifecycleContext): void {}
  public onTransitionIn(_ctx: RouteLifecycleContext): void {}
  public onLoad(_ctx: RouteLifecycleContext): void {}
  public onEntered(_ctx: RouteLifecycleContext): void {}
  public onLeave(_ctx: RouteLifecycleContext): void {}
  public onTransitionOut(_ctx: RouteLifecycleContext): void {}

  public onLeft(_ctx: RouteLifecycleContext): void {
    this.isActive = false;
    this.renderSignal.cancel();
    RouteMount.unmount(this.activeHandle, this.keepAlive);
    this.activeHandle = null;
    if (this.mountType === 'layout') this.resolvedOutlet = null;
  }

  public onReenter(_ctx: RouteLifecycleContext): void {}
  public onError(_ctx: RouteErrorContext): void {}

  private handleRenderError(error: unknown): void {
    console.error(`Error rendering AURARoute (path: ${this.path}):`, error);

    if (!this.isActive) return;

    const message = error instanceof Error ? error.message : 'Error loading content';
    const stackTrace = error instanceof Error ? error.stack : '';

    this.show(
      `<div class="aura-route-error">
      <h2>Content Loading Error</h2>
      <p>${message}</p>
      ${stackTrace ? `<pre class="error-stack">${stackTrace}</pre>` : ''}
    </div>`,
      undefined,
      'content',
    );
  }
}

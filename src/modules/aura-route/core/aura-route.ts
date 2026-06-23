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
import type { ViewHandle } from '../../aura-outlet/core/aura-outlet';
import { RouteViewController } from './view-controller';

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

type AuraRouteGuards = 'leave'|'enter'|'load';
type AuraRouteTransitionEffects = 'transitionIn'|'transitionOut';
type AuraRoutePostShowEffects = 'left'|'entered';

export interface AuraRouteInfo{
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

  private abortController: AbortController;

  private cachedHtml: string;

  private router: AuraRouter;

  private activeHandle: ViewHandle | null = null;

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

    if(!this.router){
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
    if (!this.content) {
      console.warn(`AURARoute with path "${this.path}" has no content specified`);
    }
  }

  get guards(): Record<AuraRouteGuards, string[]>{
    const result={} as Record<AuraRouteGuards, string[]>;
    this.leave && (result.leave =  this.leave);
    this.enter && (result.enter =  this.enter);
    this.load && (result.load =  this.load);
    return result;
  }

  get preRendersEffects(){
    return {}
  }

  get postRendersEffects(){
    return {}
  }

  disconnectedCallback(): void {
    this.abortController?.abort();
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

  public async render(routeInfo?: MatchedRouteInfo): Promise<void> {
    try {
      this.isActive = true;
      this.hidden = false;
      this.resetAbortController();

      if (this.preserveState && this.activeHandle) return;

      /*
            if (this.cachedContent) {
              // if (this.cachedContent && (this.cachedContent as Node).firstChild) {
              this.setContent(root, (this.cachedContent as Node).cloneNode(true))
              return
            }
      */

      //todo add delay, to prevent blink effect
      if (this.loadingTemplate) {
        this.commitView(getTemplate(this.loadingTemplate), routeInfo);
      }

      const content = await this.getContent(routeInfo);

      // fetch прерван job.abort / cancelPendingRender — тихий выход
      if (this.abortController?.signal.aborted) return;

      if (!content) {
        this.commitView('<div>No content to display</div>', routeInfo);
        return;
      }

      this.commitView(content, routeInfo);
    } catch (error) {
      if (this.abortController?.signal.aborted) return;

      if (this.errorTemplate) {
        try {
          this.commitView(getTemplate(this.errorTemplate), routeInfo);
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

  protected async getContent(routeInfo?: MatchedRouteInfo): Promise<Node | string> {
    // todo add static, cached loaders loader
    const loader = ContentLoaderRegistry.create(this.source, AURARoute.resolveContentLoaderService());

    try {
      return await loader.load(this.content, {
        signal: this.abortController.signal,
        componentOptions: this.buildComponentOptions(routeInfo),
      });
    } catch (error: unknown) {
      if (this.abortController.signal.aborted) return '';

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

  private resetAbortController(): void {
    this.abortController?.abort();
    this.abortController = new AbortController();
  }

  /** Abort in-flight content load for the current render (called by router on job abort). */
  cancelPendingRender(): void {
    this.abortController?.abort();
  }

  private commitView(content: Node | string, routeInfo?: MatchedRouteInfo): void {
    if (!this.isActive) return;

    const handle = RouteViewController.commit({
      router: this.router,
      routeInfo,
      content,
      signal: this.abortController?.signal,
    });

    if (handle) this.activeHandle = handle;
  }


  public onEnter(_ctx: RouteLifecycleContext): void {}

  public onTransitionIn(_ctx: RouteLifecycleContext): void {}

  public onLoad(_ctx: RouteLifecycleContext): void {}

  public onEntered(_ctx: RouteLifecycleContext): void {}

  public onLeave(_ctx: RouteLifecycleContext): void {}

  public onTransitionOut(_ctx: RouteLifecycleContext): void {}

  public onLeft(_ctx: RouteLifecycleContext): void {
    this.isActive = false;
    this.abortController?.abort();
    RouteViewController.teardown(this.activeHandle, this.preserveState);
    this.activeHandle = null;
  }

  public onReenter(_ctx: RouteLifecycleContext): void {}

  public onError(_ctx: RouteErrorContext): void {}

/*
\
  protected async loadHtml(): Promise<string> {
    if (this.cachedHtml) return this.cachedHtml;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
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

    this.commitView(
      `<div class="aura-route-error">
      <h2>Content Loading Error</h2>
      <p>${errorMessage}</p>
      ${stackTrace ? `<pre class="error-stack">${stackTrace}</pre>` : ''}
    </div>`,
    );
  }
}

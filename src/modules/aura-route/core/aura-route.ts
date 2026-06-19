import { attr, boolAttr } from '../../aura-utils/decorators';
import { getTemplate, parseCommaSeparated } from '../../aura-utils/misc';
import {
  ContentLoaderRegistry,
  ContentLoaderService,
  type LoaderConstructor,
} from '../../aura-content-loaders/core';
import type { RouteInstance } from '../../aura-route-hooks/core';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/aura-routing-engine';

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
type AuraRoutePreRenderEffects = 'entering';
type AuraRoutePostRenderEffects = 'leaving'|'left'|'entered';

export interface AuraRouteInfo{
  path: string;
  guards: Record<AuraRouteGuards, string[]>;
  preRenders: Record<AuraRoutePreRenderEffects, string[]>;
  postRenders: Record<AuraRoutePostRenderEffects, string[]>;
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
  @attr({ parser: parseCommaSeparated }) entering: string[] | null;
  @attr({ parser: parseCommaSeparated }) load: string[] | null;
  @attr({ parser: parseCommaSeparated }) entered: string[] | null;
  @attr({ parser: parseCommaSeparated }) leave: string[] | null;
  @attr({ parser: parseCommaSeparated }) leaving: string[] | null;
  @attr({ parser: parseCommaSeparated }) left: string[] | null;
  @attr({ parser: parseCommaSeparated }) reentered: string[] | null;
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

    this.validateAttributes();
    // todo Retry-механизмы для загрузки контента.
    if (this.preload) {
      try {
        await this.preloadContent();

      } catch (error) {
        console.log(error);
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
      console.log(`Rendering started ${this.path}`);

      this.isActive = true;
      this.hidden = false;
      this.resetAbortController();

      // do not make rerender with preserveState flag
      if (this.preserveState && this.innerHTML) return;

      /*
            if (this.cachedContent) {
              // if (this.cachedContent && (this.cachedContent as Node).firstChild) {
              this.setContent(root, (this.cachedContent as Node).cloneNode(true))
              return
            }
      */

      //todo add delay, to prevent blink effect
      if (this.loadingTemplate) {
        this.setContent(getTemplate(this.loadingTemplate));
      }

      const content = await this.getContent(routeInfo);

      // fetch прерван job.abort / cancelPendingRender — тихий выход
      if (this.abortController?.signal.aborted) return;

      if (!content) {
        this.setContent('<div>No content to display</div>');
        return;
      }

      //  this.cachedContent = content
      this.setContent(content as DocumentFragment);
    } catch (error) {
      if (this.abortController?.signal.aborted) return;

      if (this.errorTemplate) {
        try {
          this.setContent(getTemplate(this.errorTemplate));
        } catch (templateError) {
          console.warn(`Failed to render errorTemplate for route "${this.path}":`, templateError);
          this.handleRenderError(error);
        }
      } else {
        this.handleRenderError(error);
      }

      throw error;
    } finally {
      console.log('Rendering finished');
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

  protected setContent($content: Node | string) {
    if (!this.isActive) return;
    if ($content instanceof Node) {
      this.innerHTML = '';
      this.appendChild($content);
    } else {
      this.innerHTML = $content;
    }
  }


  public onEnter(ctx: MatchedRouteInfo): void {
    // lifecycle: enter phase
    console.log(ctx);
  }

  public onLoad(ctx: MatchedRouteInfo): void {
    // lifecycle: load phase — prefetch route data before render
    console.log(`load ${this.path}`, ctx.url);
  }

  public onEntering(ctx: MatchedRouteInfo): void {
    // lifecycle: entering phase — transition in before render
    console.log(`entering ${this.path}`, ctx.url);
  }

  public onEntered(ctx: MatchedRouteInfo): void {
    console.log(`entered ${this.path}`, ctx.url);
  }

  public beforeLeave(context: MatchedRouteInfo): void {
    console.log(`afterLeave ${this.path}`, context.url);
  }

  public afterLeave(context: MatchedRouteInfo): void {
    console.log(`afterLeave ${this.path}`, context.url);
  }

  public onLeaving(ctx: MatchedRouteInfo): void {
    // lifecycle: leaving phase — transition out before teardown
    console.log(`leaving ${this.path}`, ctx.url);
  }

  public onLeft(ctx: MatchedRouteInfo): void {
    this.isActive = false;
    this.abortController?.abort();
    this.hidden = true;
    console.log(`left ${this.path}`, ctx.url);
    if (!this.preserveState) this.textContent = ''; // todo or move to memory template, to restore after
  }

  public onReentered(ctx: MatchedRouteInfo): void {
    console.log(`reentered ${this.path}`, ctx.url);
  }

  public onError(ctx: any): void {
    console.error(`error ${this.path}`, ctx.error);
  }

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

    this.innerHTML = `
    <div class="aura-route-error">
      <h2>Content Loading Error</h2>
      <p>${errorMessage}</p>
      ${stackTrace ? `<pre class="error-stack">${stackTrace}</pre>` : ''}
    </div>
  `;
  }
}

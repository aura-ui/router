import { attr } from '../../utils/decorators/attr';
import { boolAttr } from '../../utils/decorators/bool-attr';
import { getTemplate } from '../../utils/misc/dom';
import { dispatchCustomEvent } from '../../utils/misc/events';
import {
  ContentLoaderRegistry,
  ContentLoaderService,
  type LoaderConstructor,
} from '../aura-content-loaders/core';
import { parseCommaSeparated } from '../../utils/misc/format';
import type { RouteLifecycleContext } from '../aura-route-hooks/core';

export const ROUTE_RENDERED_EVENT = 'route-rendered';

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

// AURARoute.setDefaultOptions({
//   reserveState: true, // значения по умолчанию для всех маршрутов
// })

let sharedContentLoaderService: ContentLoaderService | undefined;

export class AURARoute extends HTMLElement implements AURARouteInterface {
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

  @attr({ parser: parseCommaSeparated }) enter: string[];
  @attr({ parser: parseCommaSeparated }) entered: string[];
  @attr({ parser: parseCommaSeparated }) leave: string[];
  @attr({ parser: parseCommaSeparated }) reentered: string[];

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

  public async render(options = {}): Promise<void> {
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
              dispatchCustomEvent(this, ROUTE_RENDERED_EVENT)
              return
            }
      */

      //todo add delay, to prevent blink effect
      if (this.loadingTemplate) {
        this.setContent(getTemplate(this.loadingTemplate));
      }

      const content = await this.getContent(options);

      if (!content) {
        this.setContent('<div>No content to display</div>');
        return;
      }

      //  this.cachedContent = content
      this.setContent(content as DocumentFragment);

      dispatchCustomEvent(this, ROUTE_RENDERED_EVENT);


    } catch (error) {
      if (this.abortController?.signal.aborted) return;

      if (this.errorTemplate) {
        try {
          this.setContent(getTemplate(this.errorTemplate));
          return;
        } catch (templateError) {
          console.warn(`Failed to render errorTemplate for route "${this.path}":`, templateError);
        }
      }

      this.handleRenderError(error);
    } finally {
      console.log('Rendering finished');
    }
  }

  protected async getContent(options: any): Promise<Node | string> {
    // todo add static, cached loaders loader
    const loader = ContentLoaderRegistry.create(this.source, AURARoute.resolveContentLoaderService());

    try {
      return await loader.load(this.content, { signal: this.abortController.signal });
    } catch (error: unknown) {
      if (this.abortController.signal.aborted) return '';

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${loader.type} content for route ${this.path}: ${message}`);
    }
  }

  private resetAbortController(): void {
    this.abortController?.abort();
    this.abortController = new AbortController();
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


  public onEnter(ctx: RouteLifecycleContext): void {
    // lifecycle: enter phase
    console.log(ctx);
  }

  public onEntered(ctx: RouteLifecycleContext): void {
    console.log(`entered ${this.path}`, ctx.to.path);
  }

  public onLeave(ctx: RouteLifecycleContext): void {
    this.isActive = false;
    this.abortController?.abort();
    this.hidden = true;
    console.log(`leave ${this.path}`, ctx.to.path);
    if (!this.preserveState) this.textContent = ''; // todo or move to memory template, to restore after
  }

  public onReentered(ctx: RouteLifecycleContext): void {
    console.log(`reentered ${this.path}`, ctx.to.path);
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

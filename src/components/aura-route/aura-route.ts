import { attr } from '../../utils/decorators/attr'
import { sanitizeHtml, loadContent, loadAndRegisterComponent } from '../../utils/misc/loaders'
import { boolAttr } from '../../utils/decorators/bool-attr'
import { getTemplate } from '../../utils/misc/dom'
import { dispatchCustomEvent } from '../../utils/misc/events'

export const ROUTE_RENDERED_EVENT = 'route-rendered'

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

export class AURARoute extends HTMLElement implements AURARouteInterface {
  static is = 'aura-route'

  @attr({ readonly: true }) path: string
  @attr({ readonly: true }) html: string
  @attr({ readonly: true }) htmlSrc: string
  @attr({ readonly: true }) component: string
  @attr({ readonly: true }) componentSrc: string
  @attr({ readonly: true }) template: string
  @attr({ readonly: true, inherit: true, cached: true }) loadingTemplate: string
  @attr({ readonly: true, inherit: true, cached: true }) errorTemplate: string
  @boolAttr({ readonly: true }) preload: boolean
  @boolAttr({ readonly: true }) preserveState: boolean
  @boolAttr({ readonly: true }) restoreScroll: boolean

  // cache-timeout
  @boolAttr() cache: boolean //todo add times in seconds how many to store?

  private isActive: boolean

  private cachedContent: Node | string

  private abortController: AbortController

  private cachedHtml: string

  // private cachedTemplate: HTMLTemplateElement

  async connectedCallback(): Promise<void> {
    // this.cachedTemplate = document.createElement('template')
    // call them for executing getters decorators before routes will be unmount from DOM
    // this.loadingTemplate
    // this.errorTemplate
    this.validateAttributes();
    // todo Retry-механизмы для загрузки контента.
    if (this.preload) {
      try {
        await this.preloadContent()

      } catch (error) {
        console.log(error)
      }
      // todo clean on attr change
    }
  }

  private validateAttributes(): void {
    if (!this.path) {
      throw new Error('AURARoute must have a path attribute');
    }
    const hasContent = !!(this.template || this.componentSrc || this.component || this.html || this.htmlSrc);
    if (!hasContent) {
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
    if (this.componentSrc) return await loadAndRegisterComponent(this.componentSrc)
    if (this.htmlSrc) return await this.loadHtml()
  }

  public async render(options = {}): Promise<void> {
    try {
      console.log(`Rendering started ${this.path}`)

      this.isActive = true
      this.hidden = false

      // do not make rerender with preserveState flag
      if (this.preserveState && this.innerHTML) return

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
        this.setContent(getTemplate(this.loadingTemplate))
      }

      const content = await this.getContent(options)

      if (!content) {
        this.setContent('<div>No content to display</div>')
        return
      }

      //  this.cachedContent = content
      this.setContent( content as DocumentFragment)

      dispatchCustomEvent(this, ROUTE_RENDERED_EVENT)


    } catch (error) {
      // this.errorTemplate
      //   ? this.setContent(root, getTemplate(this.errorTemplate))
      //   :
      this.handleRenderError( error)
    } finally {
      console.log('Rendering finished')
    }
  }

  protected async getContent(options: any): Promise<Node | string> {
    if (this.template) return getTemplate(this.template)
    if (this.componentSrc) return sanitizeHtml(await this.loadComponent(options))
    if (this.component) return sanitizeHtml(this.getComponent(options))
    if (this.html) return sanitizeHtml(this.html)
    if (this.htmlSrc) return sanitizeHtml(await this.loadHtml())
    return ''
  }

  protected setContent($content: Node | string) {
    if (!this.isActive) return
    if ($content instanceof Node) {
      this.innerHTML = ''
      this.appendChild($content)
    } else {
      this.innerHTML = $content
    }
  }

  public leave() {
    this.isActive = false
    this.abortController?.abort()
    this.hidden = true
    console.log(`leave ${this.path}`)
    if (!this.preserveState) this.textContent = '' // todo or move to memory template, to restore after
  }

  public already() {
    console.log(`already ${this.path}`)
  }

  private async loadComponent(options: any) {
    const tagName = await loadAndRegisterComponent(this.componentSrc)
    return this.getComponent(options, tagName)
  }

  private getComponent(options: any, tagName = this.component) {
    const defined = customElements.get(tagName)
    if (!defined) throw new Error(`Component ${tagName} is not defined`)
    return `<${tagName} aura-data='${JSON.stringify(options)}'></${tagName}>`
  }

  protected async loadHtml(): Promise<string> {
    if (this.cachedHtml) return this.cachedHtml
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    this.cachedHtml = await loadContent(`${window.location.origin}/${this.htmlSrc}`, signal)
    return this.cachedHtml
  }

  private handleRenderError(error: unknown): void {
    console.error(`Error rendering AURARoute (path: ${this.path}):`, error)

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

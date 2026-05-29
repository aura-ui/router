import { attr } from '../../utils/decorators/attr'
import { sanitizeHtml, loadContent, loadAndRegisterComponent } from '../../utils/misc/loaders'
import { boolAttr } from '../../utils/decorators/bool-attr'
import { getTemplate } from '../../utils/misc/dom'

export interface AURARouteInterface {
  path: string;
  html?: string;
  htmlSrc?: string;
  component?: string;
  componentSrc?: string;
  template?: string;
  cache?: boolean;
}

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
  @boolAttr() cache: boolean //todo add times in seconds how many to store?

  private isActive: boolean

  private cachedContent: Node | string

  private abortController: AbortController

  private cachedHtml: string

  // private cachedTemplate: HTMLTemplateElement

  async connectedCallback(): Promise<void> {
    // this.cachedTemplate = document.createElement('template')
    // call them for executing getters decorators before routes will be unmount from DOM
    this.loadingTemplate
    this.errorTemplate
    if (this.preload) {
      try {
        await this.preloadContent()

      } catch (error) {
        console.log(error)
      }
      // todo clean on attr change
    }
  }

  protected async preloadContent() {
    if (this.componentSrc) return await loadAndRegisterComponent(this.componentSrc)
    if (this.htmlSrc) return await this.loadHtml()
  }

  public async render(root: HTMLElement, options = {}): Promise<void> {
    try {
      console.log(`Rendering started ${this.path}`)

      this.isActive = true

      if (this.cachedContent) {
        // if (this.cachedContent && (this.cachedContent as Node).firstChild) {
        this.setContent(root, (this.cachedContent as Node).cloneNode(true))
        return
      }

      if (this.loadingTemplate) {
        this.setContent(root, getTemplate(this.loadingTemplate))
      }

      const content = await this.getContent(options)

      if (!content) {
        this.setContent(root, '<div>No content to display</div>')
        return
      }

      this.cachedContent = content
      this.setContent(root, content as DocumentFragment);
      (root as any).router.updatePageLinks()


    } catch (error) {
      // this.errorTemplate
      //   ? this.setContent(root, getTemplate(this.errorTemplate))
      //   :
      this.handleRenderError(root, error)
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

  protected setContent($host: HTMLElement, $content: Node | string) {
    if (!this.isActive) return
    if ($content instanceof Node) {
      $host.innerHTML = ''
      $host.appendChild($content)
    } else {
      $host.innerHTML = $content
    }
  }

  public leave() {
    this.isActive = false
    this.abortController?.abort()
    console.log(`leave ${this.path}`)
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

  private handleRenderError(root: HTMLElement, error: unknown): void {
    console.error(`Error rendering AURARoute (path: ${this.path}):`, error)

    if (!this.isActive) return

    const errorMessage = error instanceof Error ? error.message : 'Error loading content'

    root.innerHTML = `
      <div class="aura-route-error">
        <h2>Content Loading Error</h2>
        <p>${errorMessage}</p>
      </div>
    `
  }
}

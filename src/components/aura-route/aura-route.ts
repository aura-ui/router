import { attr } from '../../utils/decorators/attr'
import { loadComponent } from '../../utils/misc/loaders'
import { boolAttr } from '../../utils/decorators/bool-attr'

export interface AURARouteInterface {
  path: string;
  html?: string;
  htmlSrc?: string;
  component?: string;
  componentSrc?: string;
  template?: string;
  cache?: boolean;
}

const sleep = (time: number) => new Promise(resolve => setTimeout(resolve, time))

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
  @boolAttr({ readonly: true }) cache: boolean

  private loadedComponents: Map<string, any>

  connectedCallback(): void {
    this.loadedComponents = new Map()
  }

  public async render(root: HTMLElement): Promise<void> {
    try {

      this.loadingTemplate && this.renderTemplate(root, this.loadingTemplate)

      if (this.template) {
        this.renderTemplate(root, this.template)
      } else if (this.componentSrc) {
        await this.loadAndRenderComponent(root)
      } else if (this.component) {
        this.renderComponent(root)
      } else if (this.html) {
        this.renderHtml(root)
      } else if (this.htmlSrc) {
        await this.loadAndRenderHtml(root)
      } else {
        root.innerHTML = '<div>No content to display</div>'
      }
    } catch (error) {
      this.errorTemplate
        ? this.renderTemplate(root, this.errorTemplate)
        : this.handleRenderError(root, error)
    }
  }

  private renderHtml(root: HTMLElement) {
    root.innerHTML = this.html
  }

  private renderTemplate(root: HTMLElement, templateId: string) {
    const template = document.getElementById(templateId) as HTMLTemplateElement
    if (!template) {
      throw new Error(`Template with id "${templateId}" not found`)
    }

    if (!(template instanceof HTMLTemplateElement)) {
      throw new Error(`Element with id "${templateId}" is not a template`)
    }

    root.innerHTML = ''
    root.appendChild(template?.content.cloneNode(true))
  }

  private renderComponent(root: HTMLElement) {
    const defined = customElements.get(this.component)
    if (!defined) throw new Error(`Component ${this.component} is not defined`)
    root.innerHTML = `<${this.component}></${this.component}>`
  }

  private async loadAndRenderHtml(root: HTMLElement) {
    try {
      const response = await fetch(this.htmlSrc)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      //todo add abord
      await sleep(1000)

      const html = await response.text()
      root.innerHTML = html
    } catch (error: any) {
      throw new Error(`Failed to load HTML from ${this.htmlSrc}: ${error.message}`)
    }
  }

  private async loadAndRenderComponent(root: HTMLElement) {
    try {
      //todo add abord
      let component = this.cache
        ? this.loadedComponents.get(this.componentSrc)
        : undefined

      if (!component) {
        component = await loadComponent(this.componentSrc)
        if (this.cache) {
          this.loadedComponents.set(this.componentSrc, component)
        }
      }
      root.innerHTML = component
    } catch (error: any) {
      throw new Error(`Failed to load component from ${this.componentSrc}: ${error.message}`)
    }
  }

  private handleRenderError(root: HTMLElement, error: unknown): void {
    console.error(`Error rendering AURARoute (path: ${this.path}):`, error)

    const errorMessage = error instanceof Error ? error.message : 'Error loading content'

    root.innerHTML = `
      <div class="aura-route-error">
        <h2>Content Loading Error</h2>
        <p>${errorMessage}</p>
      </div>
    `
  }
}

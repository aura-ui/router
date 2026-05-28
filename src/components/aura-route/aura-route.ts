import { attr } from '../../utils/decorators/attr'
import { loadComponent } from '../../utils/misc/loaders'

export interface AURARouteInterface {
  path: string;
  html: string;
  htmlSrc: string;
  component: string;
  componentSrc: string;
  template: string;
}

export class AURARoute extends HTMLElement implements AURARouteInterface {
  static is = 'aura-route'

  @attr({ readonly: true }) path: string
  @attr({ readonly: true }) html: string
  @attr({ readonly: true }) htmlSrc: string
  @attr({ readonly: true }) component: string
  @attr({ readonly: true }) componentSrc: string
  @attr({ readonly: true }) template: string

  public async render(root: HTMLElement): Promise<void> {
    try {
      if (this.template) {
        this.renderTemplate(root)
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
      this.handleRenderError(root, error)
    }
  }

  private renderHtml(root: HTMLElement) {
    root.innerHTML = this.html
  }

  private renderTemplate(root: HTMLElement) {
    const template = document.getElementById(this.template) as HTMLTemplateElement
    if (!template) {
      throw new Error(`Template with id "${this.template}" not found`)
    }

    if (!(template instanceof HTMLTemplateElement)) {
      throw new Error(`Element with id "${this.template}" is not a template`)
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
    //todo
    return Promise.resolve(root)
  }

  private async loadAndRenderComponent(root: HTMLElement) {
    try {
      root.innerHTML = await loadComponent(this.componentSrc)
    } catch (error: any) {
      throw new Error(error)
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

import { attr } from '../../utils/decorators/attr'
import { loadComponent } from '../../utils/misc/loaders'

export interface AURARouteInterface {
  path: string;
  element: string;
  html: string;
  template: string;
}

export class AURARoute extends HTMLElement implements AURARouteInterface {

  static is = 'aura-route'

  @attr({ readonly: true }) path: string
  @attr({ readonly: true }) html: string
  @attr({ readonly: true }) element: string
  @attr({ readonly: true }) elementPath: string
  @attr({ readonly: true }) template: string

  public async render(root: HTMLElement) {
    if (this.html) {
      root.innerHTML = this.html
    }
    if (this.element) {
      root.innerHTML = `<${this.element}></${this.element}>`
    }
    if (this.elementPath) {
      try {
        root.innerHTML = await loadComponent(this.elementPath)
      } catch (error) {
        root.innerHTML = 'component error loading'
      }
    }

    if (this.template) {
      const template = document.getElementById(this.template) as HTMLTemplateElement
      root.innerHTML = '';
      root.appendChild(template?.content.cloneNode(true));
    }
  }
}
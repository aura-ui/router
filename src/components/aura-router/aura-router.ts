import Navigo from 'navigo'
import { AURARoute, type AURARouteInterface } from '../aura-route/aura-route'
import { attr } from '../../utils/decorators/attr'

export class AURARouter extends HTMLElement {
  static is = 'aura-router'

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string

  routes: Map<string, AURARouteInterface>

  private router: Navigo

  protected connectedCallback(): void {
    this.collectRoutes()
    this.initRouter()
  }

  private collectRoutes() {
    const routes: NodeListOf<AURARoute> = this.querySelectorAll(AURARoute.is)
    this.routes = new Map<string, AURARoute>()
    for (const route of routes) {
      route.path && this.routes.set(route.path, route)
    }
  }

  private initRouter() {
    this.router = new Navigo('/', {
      strategy: 'ONE',
      hash: false,
      noMatchWarning: false,
      linksSelector: this.linksSelector,
    })

    this.routes.forEach((route: any) => {
      this.router.on(route.path, () => route.render(this))
    })

    this.router.resolve()
    this.router.updatePageLinks()
  };

  protected disconnectedCallback() {
    this.router?.destroy()
  }
}
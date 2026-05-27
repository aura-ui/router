import Navigo from 'navigo'
import { AURARoute, type AURARouteInterface } from '../aura-route/aura-route'

export class AURARouter extends HTMLElement {
  static is = 'aura-router'

  routes: Map<string, AURARouteInterface>

  private router: Navigo

  connectedCallback(): void {
    this.collectRoutes()
    this.initRoutes()
  }

  collectRoutes() {
    const routes: NodeListOf<AURARoute> = this.querySelectorAll(AURARoute.is)
    this.routes = new Map<string, AURARoute>()

    for (const route of routes) {
      const path = route.getAttribute('path')
      if (path !== null) {
        this.routes.set(path, route)
      }
    }
  }

  initRoutes() {
    this.router = new Navigo('/', {
      strategy: 'ONE',
      hash: false,
      noMatchWarning: false,
      linksSelector: '[data-router-link]',
    })

    this.routes.forEach((route: any) => {
      const path = route.getAttribute('path')
      if (path !== null) {
        this.router.on(path, () => {
          this.innerHTML = route.getAttribute('html')
        })
      }
    })

    this.router.resolve()
    this.router.updatePageLinks()
  };

  protected disconnectedCallback() {
    this.router?.destroy()
  }
}
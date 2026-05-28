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
      this.router.on(route.path, (opt: any) => route.render(this, opt), {
     /*   before(done) {
          console.log('root before')
          done()
        },
        after() {
          console.log('root after')
        },
        leave(done) {
          console.log('root leave')
          done()
        },
     */
      })
     /* this.router.addBeforeHook(route.path, (done: any, match: any) => {
        // my before hook logic
        console.log('before', this.router.getCurrentLocation())
        console.log('match', match)
        done()
      })
      this.router.addAfterHook(route.path, () => {
        // my before hook logic
        console.log('after', this.router.getCurrentLocation())
      })
      this.router.addLeaveHook(route.path, (done: any) => {
        // my before hook logic
        console.log('leave ', this.router.getCurrentLocation())
        done()
      })
      this.router.addAlreadyHook(route.path, () => {
        // my before hook logic
        console.log('already', this.router.getCurrentLocation())
      })*/
    })

    this.router.notFound(() => {
      this.innerHTML = 'page no found'
    })

    this.router.resolve()
    // console.log('location')
    // console.log(this.router.getCurrentLocation())
    // console.log(this.router.match("/user/1"));
    this.router.updatePageLinks()
  };

  protected disconnectedCallback() {
    this.router?.destroy()
  }
}
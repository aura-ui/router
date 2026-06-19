// 1. передаем роуты, запоминаем их
// 2. делаем механизм прослушивания кликов по документу и popstate
// 3. когда отловленно событие spa перехода - выбираем самый подходящий патерн соответствующий href
// 4. вызываем следующий слой обработчика (processor) - передаем в него from и to (этот слой будет запускать все необходимык фазы для ротеру)
// 5. если фазы благополучно прошли - нам необходимо поменять урл (атомарность перехода)

import type { AURARoute } from '../../aura-route/core/aura-route';
import { bind } from '../../aura-utils/misc/bind';
import { parsePath, parseQuery } from '../../aura-utils/misc/url';

export type NavigationIntent = 'push' | 'replace' | 'pop' | 'system';

export interface MatchedRouteInfo {
  /** Resolved URL pathname, e.g. `/user/42`. */
  url: string;
  /** Registered route pattern, e.g. `/user/:id`. */
  routePath: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export class AuraRoutingEngine {

  private readonly config: any;

  private routes = new Map<string, AURARoute>();
  private isRunning = false;
  private processor: any;
  private prevMatchedRouteInfo: MatchedRouteInfo | null;

  //DI
  constructor(processor: any) {
    this.processor = processor;
  }

  registerRoutes(routes: AURARoute[]): void {
    for (let route of routes) {
      const { path } = route;
      if (!this.routes.has(path)) {
        console.warn(`Duplicate route path "${path}" — previous route will be overwritten`);
      }
      this.routes.set(path, route);
    }
  }

  get currentLocationHref(): string {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    window.addEventListener('popstate', this.onPopState);
    document.addEventListener('click', this.onDocumentClick, { capture: true });

    void this.navigateTo(this.currentLocationHref, 'system', {
      replace: true,
      syncHistory: false,
    });
  }

  stop() {
    this.isRunning = false;
    window.removeEventListener('popstate', this.onPopState);
    document.removeEventListener('click', this.onDocumentClick, { capture: true });
  }

  destroy(): void {
    this.stop();
    this.routes.clear();
    this.prevMatchedRouteInfo = null;
  }

  @bind
  protected onPopState() {
    void this.navigateTo(this.currentLocationHref, 'pop', { replace: true, syncHistory: false });
  }

  @bind
  protected onDocumentClick(event: MouseEvent) {
    const { target } = event;
    if (!(target instanceof Element)) return;

    const selector = this.config.linksSelector ?? '[data-router-link]';
    const anchor = target.closest('a');
    if (!anchor || !anchor.matches(selector)) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;

    event.preventDefault();
    void this.navigateTo(href, 'push', { replace: false, syncHistory: true });
  }

  private isHashAnchorNavigation(pathname: string, search: string, hash: string): boolean {
    const current = parsePath(this.currentLocationHref);
    const sameRoute = pathname === current.pathname && search === current.search;
    return Boolean(sameRoute && hash && hash !== current.hash);
  }

  getMatchedRouteInfo(url: string, routePath: string, params: any, search: string): MatchedRouteInfo {
    const query = parseQuery(search);
    return {
      url,
      routePath,
      ...(params && Object.keys(params).length > 0 && { params }),
      ...(query && Object.keys(query).length > 0 && { query }),
    };
  }

  /** pathname + search (+ hash при syncHistory) */
  private async navigateTo(
    href: string,
    intent: NavigationIntent,
    options: {
      replace: boolean;
      syncHistory: boolean
    }): Promise<void> {
    const { pathname, search, hash } = parsePath(href);
    const relativeUrl = pathname + search + hash;

    // Только якорь на том же route — без полного transition
    if (this.isHashAnchorNavigation(pathname, search, hash)) {
      this.updateBrowserHistory(relativeUrl, options);
      this.prevMatchedRouteInfo && (this.prevMatchedRouteInfo.url = relativeUrl);
      this.scrollToHash(hash);
      return;
    }

    const routesPaths = Object.keys(this.routes);
    const found = this.findBestMatchRoute(pathname, routesPaths);

    if (!found) {
      this.notFoundHandler?.(relativeUrl);
      return;
    }

    const to = this.getMatchedRouteInfo(relativeUrl, found.routePath, found.params, search);

    const from = this.prevMatchedRouteInfo || null;

    this.updateBrowserHistory(relativeUrl, options);

    const ok = await this.processor.run({ from, to, intent });

    if (!ok && options.syncHistory && intent === 'push') {
      history.back();
      return;
    }

    if (ok) {
      this.prevMatchedRouteInfo = to;
      // scroll после render — контент уже на месте
      if (hash) {
        this.scrollToHash(hash);
      }
    }
  }

  updateBrowserHistory(url: string, options: any): void {
    if (options.syncHistory) {
      if (options.replace) {
        history.replaceState(null, '', url);
      } else {
        history.pushState(null, '', url);
      }
    }
  }

  private scrollToHash(hash: string): void {
    const id = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
  }

  notFoundHandler(_options: any) {

  }

  findBestMatchRoute(pathname: string, routesPaths: Iterable<string>): {
    routePath: string;
    params: Record<string, string>
  } | null {
    let best: { routePath: string; params: Record<string, string>; score: number } | null = null;

    for (const routePath of routesPaths) {
      const params = this.getPathParams(pathname, routePath);
      if (params === null) continue;
      const score = routePath.split('/').filter(Boolean).length;
      if (!best || score > best.score) {
        best = { routePath, params, score };
      }
    }

    return best ? { routePath: best.routePath, params: best.params } : null;
  }

  /**
   * Match pathname against an Express-style pattern using URLPattern.
   * Returns captured groups or null when no match.
   */
  getPathParams(pathname: string, routePath: string): Record<string, string> | null {
    try {
      const urlPattern = new URLPattern({ pathname: routePath });
      const result = urlPattern.exec({ pathname });
      if (!result) return null;

      const groups: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.pathname.groups)) {
        if (value !== undefined) groups[key] = value;
      }

      return groups;
    } catch {
      return pathname === routePath ? {} : null;
    }
  }
}


// const reentered =
// from !== null &&
// from.pattern === to.pattern &&
// from.path === to.path; // &&
//hash === current.hash; // опционально: сменился только hash → не reentered
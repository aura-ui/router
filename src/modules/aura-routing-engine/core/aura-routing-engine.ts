// 1. передаем роуты, запоминаем их
// 2. делаем механизм прослушивания кликов по документу и popstate
// 3. когда отловленно событие spa перехода - выбираем самый подходящий патерн соответствующий href
// 4. вызываем следующий слой обработчика (processor) - передаем в него from и to (этот слой будет запускать все необходимык фазы для ротеру)
// 5. если фазы благополучно прошли - нам необходимо поменять урл (атомарность перехода)

import type { AURARoute } from '../../aura-route/core/aura-route';
import { bind } from '../../aura-utils/misc/bind';
import { parsePath, parseQuery } from '../../aura-utils/misc/url';

/**
 * Способ инициации навигации.
 *
 * - `push` / `replace` — программный или клик по ссылке; URL меняет engine после успешного commit.
 * - `pop` — Back/Forward; URL уже изменён браузером до вызова processor (см. {@link AuraRoutingEngine.navigateTo}).
 * - `system` — начальная загрузка / `start()`; URL в адресной строке уже актуален.
 */
export type HistoryAction = 'push' | 'replace' | 'pop' | 'system';

export interface MatchedRouteInfo {
  /** Resolved URL pathname, e.g. `/user/42`. */
  url: string;
  pathname: string;
  search: string;
  hash: string;
  /** Registered route pattern, e.g. `/user/:id`. */
  routePath: string;
  route: AURARoute;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export class AuraRoutingEngine {

  private readonly config: any;

  private routes = new Map<string, AURARoute>();
  public isRunning = false;
  private processor: any;
  private prevMatchedRouteInfo: MatchedRouteInfo | null;

  //DI
  constructor(processor: any) {
    this.processor = processor;
  }

  registerRoutes(routes: AURARoute[]): void {
    for (let route of routes) {
      const { path } = route;
      if (this.routes.has(path)) {
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
    this.processor.stop();
    window.removeEventListener('popstate', this.onPopState);
    document.removeEventListener('click', this.onDocumentClick, { capture: true });
  }

  destroy(): void {
    this.stop();
    this.routes.clear();
    this.prevMatchedRouteInfo = null;
  }

  /**
   * Обработчик Back/Forward. Браузер меняет URL до `popstate`, поэтому `syncHistory: false`.
   *
   * При отмене перехода (`processor.run` → `false`) engine не откатывает history — это
   * ответственность processor/render. См. {@link AuraRoutingEngine.navigateTo}.
   */
  @bind
  protected onPopState() {
    void this.navigateTo(this.currentLocationHref, 'pop', { replace: true, syncHistory: false });
  }

  @bind
  protected onDocumentClick(event: MouseEvent) {
    const { target } = event;
    if (!(target instanceof Element)) return;

    const selector = this.config?.linksSelector ?? '[data-router-link]';
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

  getMatchedRouteInfo({ url, pathname, search, hash, route, routePath, params }: {
    url: string;
    pathname: string;
    search: string;
    hash: string;
    route: AURARoute;
    routePath: string;
    params?: Record<string, string>;
  }): MatchedRouteInfo {
    const query = parseQuery(search);
    return {
      url,
      pathname,
      search,
      hash,
      route,
      routePath,
      ...(params && Object.keys(params).length > 0 && { params }),
      ...(query && Object.keys(query).length > 0 && { query }),
    };
  }

  /**
   * Центральный метод навигации: match → processor → commit URL и состояния.
   *
   * **Порядок commit URL (атомарность перехода):**
   * 1. `processor.run({ from, to, intent })` — guards, load, render.
   * 2. При `ok` и `syncHistory: true` — `pushState` / `replaceState`.
   * 3. Обновление `prevMatchedRouteInfo`.
   *
   * **Отмена при `push` / `replace`:** URL ещё не менялся — engine просто выходит.
   * Откат history не нужен.
   *
   * **Отмена при `pop` (Back/Forward) — особый случай:**
   * Браузер меняет адресную строку *до* `popstate`. К моменту `processor.run` `window.location`
   * уже указывает на `to`, а UI и `prevMatchedRouteInfo` могут ещё соответствовать `from`.
   *
   * Engine при `!ok` **не откатывает** history: `history.forward()` / `pushState` создают новые
   * записи в стеке и ломают ожидаемое поведение Back/Forward. Синхронизацию URL и UI должен
   * выполнить **processor / render**, в зависимости от причины отмены:
   *
   * - **Guard отменил** (например, несохранённая форма): оставить UI на `from`, вернуть URL
   *   через `replaceState(from.url)` или программный navigate с `replace: true`.
   * - **Ошибка load/render**: показать error UI, fallback или redirect; при необходимости
   *   явно выровнять URL с отображаемым состоянием.
   * - **Redirect из guard**: navigate на целевой URL (часто с `replace: true`), а не
   *   механический возврат к `from`.
   *
   * @param href — pathname + search (+ hash).
   * @param action — способ инициации; для `pop` и `system` передаётся `syncHistory: false`.
   * @param options.replace — `replaceState` вместо `pushState` (только при `syncHistory: true`).
   * @param options.syncHistory — обновлять history после успешного commit; `false` для `pop`
   *   и начальной загрузки, когда URL уже задан браузером.
   */
  public async navigateTo(
    href: string,
    action: HistoryAction,
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

    const routesPaths = [...this.routes.keys()];
    const found = this.findBestMatchRoute(pathname, routesPaths);

    if (!found) {
      this.notFoundHandler?.(relativeUrl);
      return;
    }

    const to = this.getMatchedRouteInfo({
      url: relativeUrl,
      pathname,
      search,
      hash,
      route: this.routes.get(found.routePath) as AURARoute,
      routePath: found.routePath,
      params: found.params,
    });

    const from = this.prevMatchedRouteInfo || null;

    const result = await this.processor.run({ from, to, action });

    switch (result.status) {
      case 'committed':
        if (options.syncHistory) this.updateBrowserHistory(relativeUrl, options);
        this.prevMatchedRouteInfo = to;
        if (hash) {
          this.scrollToHash(hash);
        }
        break;

      case 'cancelled':
        if (action === 'pop' && from) {
          history.replaceState(null, '', from.url); // pop: URL уже другой
        }
        break;

      case 'redirect':
        void this.navigateTo(result.url, 'replace', { replace: result.replace ?? false, syncHistory: true });
        break;

      case 'error':
      // history не трогаем или политика по intent
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
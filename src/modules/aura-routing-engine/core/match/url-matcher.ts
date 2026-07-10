import { memoize } from '../../../aura-utils/decorators/memoize';
import { parseSearch } from '../../../aura-utils/misc/url';
import { isGlobalCatchAllPattern, isScopedCatchAllPattern } from '../route-tree/resolve-pattern';
import { attachNavigationChain } from '../route-tree/matched-chain';
import type { AuraRoute } from '../../../aura-route/core/aura-route';
import type { ResolvedView } from '../route-tree/resolved-view';
import type { RouteNode } from '../route-tree/route-node.types';

export interface MatchedRouteInfo {
  /** Relative browser href: `pathname + search + hash`, e.g. `/user/42?q=1#tab`. */
  href: string;
  /** Browser pathname without `search` / `hash`, e.g. `/user/42`. */
  pathname: string;
  search: string;
  hash: string;
  /** Resolved route pattern in the tree (`node.pattern`). May include `:param` segments, e.g. `/user/:id`. */
  pattern: string;
  route: AuraRoute;
  /** Path params: `:id` из URLPattern; catch-all `*` → `{ splat: 'foo/bar' }`. */
  params?: Record<string, string>;
  query?: Record<string, string>;
  /** Узел в route tree. */
  node?: RouteNode;
  /** Active branch root → leaf. */
  chain?: MatchedRouteInfo[];
  /** Resolved `view` attr for this navigation (leaf); set in {@link attachNavigationChain}. */
  resolvedView?: ResolvedView | null;
}

/** Результат `matchPath`: победивший узел и извлечённые path params. */
export interface NodePathMatch {
  node: RouteNode;
  params: Record<string, string>;
}

/** Declarative 404: `<aura-route path="*">` (global) or nested `path="*"` → `/prefix/*`. */
export const CATCH_ALL_SEGMENT = '*' as const;

/** Global catch-all — lowest match priority (`routeScore` → `-1`). */
const SCORE_GLOBAL_CATCH_ALL = -1;

/** Scoped `*` ranks below a static sibling at the same segment depth. */
const SCORE_SCOPED_CATCH_ALL_DEPTH_BIAS = 0.5;

/** `true` для global (`*`) и scoped (`/prefix/*`) catch-all patterns. */
export function isCatchAllRoute(pattern: string): boolean {
  return isGlobalCatchAllPattern(pattern) || isScopedCatchAllPattern(pattern);
}

/**
 * Приоритет кандидата при нескольких совпадениях: глубже pathname → выше score;
 * scoped catch-all ниже static sibling на той же глубине; global `*` — последний.
 *
 * @example `/settings/profile` → `2`; `/users/*` → `1.5`; `*` → `-1`
 */
function routeScore(pattern: string): number {
  if (isGlobalCatchAllPattern(pattern)) return SCORE_GLOBAL_CATCH_ALL;
  if (isScopedCatchAllPattern(pattern)) {
    const prefix = pattern.slice(0, -2);
    return prefix.split('/').filter(Boolean).length - SCORE_SCOPED_CATCH_ALL_DEPTH_BIAS;
  }
  return pattern.split('/').filter(Boolean).length;
}

/**
 * Сопоставление browser pathname с зарегистрированными маршрутами.
 *
 * Используется из {@link resolveNavigationTarget} и prefetch pipeline.
 * Кэширует скомпилированные `URLPattern` per pattern (`patterns`); сброс — {@link destroy}.
 */
export class AuraRoutingUrlMatcher {
  /** Compiled `URLPattern` instances keyed by route `pattern` (param routes only). */
  private readonly patterns = new Map<string, URLPattern>();

  /**
   * Находит лучший match среди `matchableNodes` registry.
   *
   * Линейный O(n) перебор: для каждого узла {@link getPathParams}, затем max {@link routeScore}.
   * При равной глубине static побеждает scoped catch-all.
   *
   * Результат мемоизируется по `pathname` только; `nodes` в ключ не входит —
   * после смены route tree вызывайте {@link destroy} или создавайте новый matcher.
   *
   * @param pathname — browser pathname без `search` / `hash`
   * @param nodes — `RouteTreeSnapshot.matchableNodes` / `registry.getMatchableNodes()`
   * @returns победивший узел + params, или `null` (→ not-found)
   *
   * @example matcher.matchPath('/settings/profile', matchableNodes)
   */
  @memoize((pathname: string) => pathname)
  matchPath(pathname: string, nodes: readonly RouteNode[]): NodePathMatch | null {
    let best: NodePathMatch & { score: number } | null = null;

    for (const node of nodes) {
      const params = this.getPathParams(pathname, node.pattern);
      if (params === null) continue;
      const score = routeScore(node.pattern);
      if (!best || score > best.score) {
        best = { node, params, score };
      }
    }

    return best ? { node: best.node, params: best.params } : null;
  }

  /**
   * Извлекает path params для пары `(pathname, pattern)`.
   *
   * Ветки (в порядке проверки):
   * 1. **global catch-all** (`*`, `/*`) — `{ splat }` = pathname без ведущего `/`
   * 2. **scoped catch-all** (`/users/*`) — {@link matchScopedCatchAll}
   * 3. **param / static** — `URLPattern.exec` через кэш {@link getUrlPattern}; при ошибке
   *    парсинга pattern — fallback `pathname === pattern ? {} : null`
   *
   * **splat** — не engine fallback при «маршрут не найден», а param зарегистрированного
   * `<aura-route path="*">`. Без `*` в дереве `matchPath` → `null`, splat не появится.
   *
   * @param pathname — browser pathname
   * @param pattern — resolved `node.pattern` (`/users/:id`, `/about`, `/users/*`, `*`)
   * @returns params object или `null` если pattern не матчит pathname
   *
   * @example global `*` — `/foo/bar` → `{ splat: 'foo/bar' }`
   * @example scoped `/users/*` — `/users/unknown` → `{ splat: 'unknown' }`
   * @example param `/users/:id` — `/users/42` → `{ id: '42' }`
   * @example static `/about` — `/about` → `{}`
   */
  getPathParams(pathname: string, pattern: string): Record<string, string> | null {
    if (isGlobalCatchAllPattern(pattern)) {
      const splat = pathname.replace(/^\//, '');
      return { splat };
    }

    if (isScopedCatchAllPattern(pattern)) {
      return matchScopedCatchAll(pathname, pattern);
    }

    try {
      const urlPattern = this.getUrlPattern(pattern);
      const result = urlPattern.exec({ pathname });
      if (!result) return null;

      const groups: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.pathname.groups)) {
        if (value !== undefined) groups[key] = value;
      }

      return groups;
    } catch {
      return pathname === pattern ? {} : null;
    }
  }

  /**
   * Сбрасывает runtime-кэши matcher.
   *
   * Очищает memoized `matchPath` и `patterns` (`URLPattern` per route pattern).
   * Вызывается из `AuraRoutingEngine.stop()`; при `registry.replace()` — тоже нужен сброс,
   * иначе `matchPath` может вернуть stale результат для того же `pathname`.
   */
  destroy() {
    memoize.clear(this, 'matchPath');
    this.patterns.clear();
  }

  /**
   * Собирает leaf {@link MatchedRouteInfo} и nested `chain` из `node.branch`.
   *
   * Парсит `search` → `query`; для предков в chain повторно вызывает {@link getPathParams}
   * (ancestor param re-match). `resolvedView` добавляется в {@link attachNavigationChain}.
   *
   * @param href — полный relative href (`pathname + search + hash`)
   * @param params — path params leaf из `matchPath`; опционально
   */
  toRouteInfo(
    href: string,
    pathname: string,
    search: string,
    hash: string,
    node: RouteNode,
    params?: Record<string, string>,
  ): MatchedRouteInfo {
    const query = parseSearch(search);

    return attachNavigationChain(
      node,
      {
        href,
        pathname,
        search,
        hash,
        ...(params && Object.keys(params).length > 0 && { params }),
        ...(query && Object.keys(query).length > 0 && { query }),
      },
      (targetPathname, targetPattern) => this.getPathParams(targetPathname, targetPattern),
    );
  }

  /** Lazy compile + reuse `URLPattern` для param/static patterns (ключ — `pattern`). */
  private getUrlPattern(pattern: string): URLPattern {
    let p = this.patterns.get(pattern);
    if (!p) {
      p = new URLPattern({ pathname: pattern });
      this.patterns.set(pattern, p);
    }
    return p;
  }
}

/**
 * Scoped catch-all: nested `path="*"` → `/users/*`.
 * splat — остаток pathname после prefix. Пример: `/users/unknown` → `{ splat: 'unknown' }`.
 */
function matchScopedCatchAll(pathname: string, pattern: string): Record<string, string> | null {
  const prefix = pattern.slice(0, -2);
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;
  if (!pathname.startsWith(prefixWithSlash)) return null;

  const splat = pathname.slice(prefixWithSlash.length);
  if (!splat) return null;

  return { splat };
}

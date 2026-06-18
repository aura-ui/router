import Navigo, { type Match } from 'navigo';

import type { RoutingEngineProvider } from '../provider';
import type {
  NavigateOptions,
  NavigationEvent,
  NavigationIntent,
  NotFoundHandler,
  ProviderRouteRegistration,
  RouteMatch,
  RoutingEngineBinding,
} from '../types';
import type { NavigoProviderConfig } from './navigo-config';
import { currentLocationUrl, toRouteMatch } from './navigo-match';

/**
 * Thin Navigo adapter — matching, history, and link interception only.
 * Reports {@link NavigationEvent} to the facade; phase orchestration is coordinator-owned.
 *
 * @deprecated Prefer `'internal'` provider (URLPattern + History API).
 */
export class NavigoProvider implements RoutingEngineProvider {
  readonly id = 'navigo';

  private readonly config: NavigoProviderConfig;
  private binding?: RoutingEngineBinding;
  private navigo?: Navigo;
  private notFoundHandler?: NotFoundHandler;
  private readonly patterns = new Set<string>();
  private lastCommitted: RouteMatch | null = null;
  private pendingIntent: NavigationIntent = 'push';

  constructor(config: NavigoProviderConfig) {
    this.config = config;
  }

  bind(binding: RoutingEngineBinding): void {
    this.binding = binding;
  }

  registerRoute(registration: ProviderRouteRegistration): void {
    this.patterns.add(registration.pattern);

    if (this.navigo) {
      this.wireRoute(registration.pattern);
    }
  }

  start(): void {
    this.ensureNavigo().resolve();
  }

  destroy(): void {
    this.teardownNavigo(true);
  }

  clearRoutes(): void {
    this.teardownNavigo();
  }

  navigate(path: string, options?: NavigateOptions): void {
    this.pendingIntent = options?.replace ? 'replace' : 'push';
    this.ensureNavigo().navigate(
      path,
      options?.replace ? { historyAPIMethod: 'replaceState' } : undefined,
    );
  }

  setNotFoundHandler(handler: NotFoundHandler): void {
    this.notFoundHandler = handler;
    this.navigo?.notFound(() => handler(currentLocationUrl()));
  }

  rebindLinks(): void {
    this.navigo?.updatePageLinks();
  }

  private wireRoute(pattern: string): void {
    const navigo = this.ensureNavigo();

    navigo.on(pattern, (match?: Match) => {
      void this.dispatch(pattern, match ?? undefined, this.pendingIntent);
      this.pendingIntent = 'push';
    });
  }

  private async dispatch(
    pattern: string,
    match: Match | undefined,
    intent: NavigationIntent,
  ): Promise<void> {
    const binding = this.requireBinding();
    const to = toRouteMatch(match ?? null, pattern);
    if (!to) return;

    const from = this.lastCommitted;
    const reentered =
      from !== null && from.pattern === to.pattern && from.path === to.path;

    const event: NavigationEvent = { from, to, intent, reentered };
    const ok = await binding.onNavigate(event);

    if (!ok && intent === 'push') {
      history.back();
      return;
    }

    if (ok) {
      this.lastCommitted = to;
    }
  }

  private ensureNavigo(): Navigo {
    if (this.navigo) return this.navigo;

    this.navigo = new Navigo(this.config.root ?? '/', {
      strategy: this.config.strategy ?? 'ONE',
      hash: this.config.hash ?? false,
      noMatchWarning: this.config.noMatchWarning ?? false,
      linksSelector: this.config.linksSelector ?? '[data-router-link]',
    });

    if (this.notFoundHandler) {
      this.navigo.notFound(() => this.notFoundHandler!(currentLocationUrl()));
    }

    for (const pattern of this.patterns) {
      this.wireRoute(pattern);
    }

    return this.navigo;
  }

  private teardownNavigo(clearRegistrations = false): void {
    this.navigo?.destroy();
    this.navigo = undefined;
    this.lastCommitted = null;

    if (clearRegistrations) {
      this.patterns.clear();
    }
  }

  private requireBinding(): RoutingEngineBinding {
    if (!this.binding) {
      throw new Error('NavigoProvider: bind() must be called before navigation');
    }
    return this.binding;
  }
}

export function createNavigoProvider(config: NavigoProviderConfig): NavigoProvider {
  return new NavigoProvider(config);
}

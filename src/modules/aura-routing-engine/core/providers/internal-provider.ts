import type { RoutingEngineProvider } from '../provider';
import type {
  NavigateOptions,
  NavigationEvent,
  NavigationIntent,
  NotFoundHandler,
  ProviderRouteRegistration,
  RoutingEngineBinding,
} from '../types';
import { currentLocationPath, resolveBestMatch, toRouteMatch } from '../url-match';

export interface InternalProviderConfig {
  root?: string;
  linksSelector?: string;
  hash?: boolean;
}

/**
 * Internal routing provider: URLPattern matching + History API + link interception.
 *
 * Reports navigation to the facade via {@link RoutingEngineBinding.onNavigate} only —
 * phase orchestration lives in NavigationCoordinator (aura-router).
 */
export class InternalProvider implements RoutingEngineProvider {
  readonly id = 'internal';

  private readonly config: InternalProviderConfig;
  private binding?: RoutingEngineBinding;
  private readonly patterns = new Set<string>();
  private notFoundHandler?: NotFoundHandler;
  private lastCommittedPath: string | null = null;
  private lastCommittedPattern: string | null = null;
  private started = false;
  private onPopState = () => void this.handlePopState();
  private onDocumentClick = (event: MouseEvent) => void this.handleLinkClick(event);

  constructor(config: InternalProviderConfig = {}) {
    this.config = config;
  }

  bind(binding: RoutingEngineBinding): void {
    this.binding = binding;
  }

  registerRoute(registration: ProviderRouteRegistration): void {
    this.patterns.add(registration.pattern);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    window.addEventListener('popstate', this.onPopState);
    document.addEventListener('click', this.onDocumentClick, true);

    void this.navigateTo(currentLocationPath() + window.location.search, 'system', {
      replace: true,
      syncHistory: false,
    });
  }

  destroy(): void {
    this.started = false;
    window.removeEventListener('popstate', this.onPopState);
    document.removeEventListener('click', this.onDocumentClick, true);
    this.patterns.clear();
    this.lastCommittedPath = null;
    this.lastCommittedPattern = null;
  }

  clearRoutes(): void {
    this.patterns.clear();
    this.lastCommittedPath = null;
    this.lastCommittedPattern = null;
  }

  navigate(path: string, options?: NavigateOptions): void {
    const intent: NavigationIntent = options?.replace ? 'replace' : 'push';
    void this.navigateTo(path, intent, { replace: options?.replace ?? false, syncHistory: true });
  }

  setNotFoundHandler(handler: NotFoundHandler): void {
    this.notFoundHandler = handler;
  }

  rebindLinks(): void {
    // Click delegation — no scan required.
  }

  private async handlePopState(): Promise<void> {
    await this.navigateTo(
      currentLocationPath() + window.location.search,
      'pop',
      { replace: true, syncHistory: false },
    );
  }

  private handleLinkClick(event: MouseEvent): void {
    const selector = this.config.linksSelector ?? '[data-router-link]';
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest('a');
    if (!anchor || !anchor.matches(selector)) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;

    event.preventDefault();
    void this.navigateTo(href, 'push', { replace: false, syncHistory: true });
  }

  private async navigateTo(
    rawPath: string,
    intent: NavigationIntent,
    options: { replace: boolean; syncHistory: boolean },
  ): Promise<void> {
    const binding = this.requireBinding();
    const { pathname, search } = this.parsePath(rawPath);
    const resolved = resolveBestMatch(pathname, this.patterns);

    if (!resolved) {
      this.notFoundHandler?.(pathname + search);
      return;
    }

    const to = toRouteMatch(pathname, resolved.pattern, search);
    const from =
      this.lastCommittedPattern && this.lastCommittedPath
        ? toRouteMatch(
            this.lastCommittedPath.split('?')[0] ?? this.lastCommittedPath,
            this.lastCommittedPattern,
            this.lastCommittedPath.includes('?')
              ? '?' + this.lastCommittedPath.split('?')[1]
              : '',
          )
        : null;

    const reentered =
      from !== null &&
      from.pattern === to.pattern &&
      from.path === to.path;

    if (options.syncHistory) {
      const url = pathname + search;
      if (options.replace) {
        history.replaceState(null, '', url);
      } else {
        history.pushState(null, '', url);
      }
    }

    const event: NavigationEvent = { from, to, intent, reentered };
    const ok = await binding.onNavigate(event);

    if (!ok && options.syncHistory && intent === 'push') {
      history.back();
      return;
    }

    if (ok) {
      this.lastCommittedPath = to.path;
      this.lastCommittedPattern = to.pattern;
    }
  }

  private parsePath(rawPath: string): { pathname: string; search: string } {
    const url = new URL(rawPath, window.location.origin);
    return { pathname: url.pathname, search: url.search };
  }

  private requireBinding(): RoutingEngineBinding {
    if (!this.binding) {
      throw new Error('InternalProvider: bind() must be called before navigation');
    }
    return this.binding;
  }
}

export function createInternalProvider(config: InternalProviderConfig): InternalProvider {
  return new InternalProvider(config);
}

import type {
  NavigationHandler,
  NavigationProvider,
  NavigateHistoryOptions,
} from './navigation-provider.types';

/**
 * In-memory history для unit-тестов — без window/history/DOM.
 *
 * ```ts
 * const provider = new FakeHistoryProvider('/');
 * engine = new AuraRoutingEngine(processor, router, { provider });
 * provider.start();
 * provider.goBack(); // симуляция Back
 * ```
 */
export class FakeHistoryProvider implements NavigationProvider {
  private stack: string[];
  private index = 0;
  private handler?: NavigationHandler;
  private listening = false;

  constructor(initial = '/') {
    this.stack = [initial];
  }

  get currentHref(): string {
    return this.stack[this.index] ?? '/';
  }

  /** Текущий стек (только для assertions в тестах). */
  get entries(): readonly string[] {
    return this.stack.slice(0, this.index + 1);
  }

  onNavigation(handler: NavigationHandler): void {
    this.handler = handler;
  }

  start(): void {
    this.listening = true;
  }

  destroy(): void {
    this.listening = false;
    this.handler = undefined;
  }

  commit(url: string, options: NavigateHistoryOptions): void {
    if (!options.syncHistory) return;

    if (options.replace) {
      this.stack[this.index] = url;
    } else {
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push(url);
      this.index = this.stack.length - 1;
    }
  }

  rollback(url: string): void {
    this.stack[this.index] = url;
  }

  /** Симуляция Back — URL меняется до emit, как в браузере. */
  goBack(): void {
    if (!this.listening || this.index <= 0) return;
    this.index--;
    this.handler?.({
      href: this.currentHref,
      action: 'pop',
      replace: true,
      syncHistory: false,
    });
  }

  /** Симуляция Forward. */
  goForward(): void {
    if (!this.listening || this.index >= this.stack.length - 1) return;
    this.index++;
    this.handler?.({
      href: this.currentHref,
      action: 'pop',
      replace: true,
      syncHistory: false,
    });
  }

  /** Симуляция клика по in-app ссылке. */
  clickLink(href: string): void {
    if (!this.listening) return;
    this.handler?.({
      href,
      action: 'push',
      replace: false,
      syncHistory: true,
    });
  }
}

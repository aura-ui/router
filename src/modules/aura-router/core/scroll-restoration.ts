import type { NavigationCommittedContext } from '../../aura-routing-engine/core';

export type ScrollContainer = Pick<Window, 'scrollY' | 'scrollTo'>;

/** Saves and restores viewport scroll keyed by pathname + search. */
export class ScrollRestoration {
  private readonly positions = new Map<string, number>();
  private readonly container: ScrollContainer;

  constructor(container: ScrollContainer = window) {
    this.container = container;
  }

  clear(): void {
    this.positions.clear();
  }

  apply(ctx: NavigationCommittedContext): void {
    const { from, to, action, hash } = ctx;

    if (from?.route.scrollPolicy === 'restore') {
      this.positions.set(from.pathname + from.search, this.container.scrollY);
    }

    if (hash) return;

    const policy = to.route.scrollPolicy;
    if (policy !== 'top' && policy !== 'restore') return;

    const y =
      policy === 'restore' && action === 'pop'
        ? this.positions.get(to.pathname + to.search)
        : 0;

    if (y === undefined) return;
    requestAnimationFrame(() => this.container.scrollTo(0, y));
  }
}

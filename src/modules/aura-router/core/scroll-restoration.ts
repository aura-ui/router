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

    if (from?.route.scrollPolicy === 'auto') {
      this.positions.set(from.pathname + from.search, this.container.scrollY);
    }

    if (hash) return;

    const policy = to.route.scrollPolicy;
    if (policy !== 'top' && policy !== 'auto') return;

    const restoring = policy === 'auto' && action === 'pop';
    const y = restoring ? this.positions.get(to.pathname + to.search) : 0;
    if (y === undefined) return;

    requestAnimationFrame(() => {
      if (!restoring) {
        const target = to.route.scrollTarget;
        if (target) {
          try {
            const el = document.querySelector(target);
            if (el) {
              el.scrollIntoView();
              return;
            }
          } catch {
            // invalid selector → fall through to top
          }
        }
      }
      this.container.scrollTo(0, y);
    });
  }
}

import type { ScrollBehaviorAttr } from '../../aura-route/core/attr/scroll-behavior-attr-parser';
import type { NavigationCommittedContext } from '../../aura-routing-engine/core';

export type ScrollContainer = Pick<Window, 'scrollY'> & {
  scrollTo(options: ScrollToOptions): void;
};

/**
 * Host scroll after navigation: top / scroll-target / none, plus save+restore on `auto`+`pop`.
 * Animation from route `scroll-behavior` (`smooth` | `instant` | `auto`).
 */
export class Scroller {
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

    let behavior: ScrollBehaviorAttr = to.route.scrollBehavior ?? 'auto';
    // Respect OS/browser "reduce motion": don't animate scroll even if attr asks for smooth.
    if (
      behavior === 'smooth'
      && typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      behavior = 'instant';
    }

    requestAnimationFrame(() => {
      if (!restoring) {
        const target = to.route.scrollTarget;
        if (target) {
          try {
            const el = document.querySelector(target);
            if (el) {
              el.scrollIntoView({ behavior });
              return;
            }
          } catch {
            // invalid selector → fall through to top
          }
        }
      }
      this.container.scrollTo({ top: y, left: 0, behavior });
    });
  }
}

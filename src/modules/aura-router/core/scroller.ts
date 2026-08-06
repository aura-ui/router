import type { ScrollBehaviorAttr } from '../../aura-route/core/attr/scroll-behavior-attr-parser';
import type { NavigationCommittedContext } from '../../aura-routing-engine/core';

export type ScrollContainer = Pick<Window, 'scrollY'> & {
  scrollTo(options: ScrollToOptions): void;
};

/**
 * CSSOM `behavior` for router scroll, with `prefers-reduced-motion: reduce` → `instant`.
 */
export function resolveNativeScrollBehavior(
  attr: ScrollBehaviorAttr | null | undefined,
): ScrollBehaviorAttr {
  const behavior = attr ?? 'auto';
  if (
    behavior === 'smooth'
    && typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 'instant';
  }
  return behavior;
}

/**
 * Host scroll after navigation: top / scroll-target / none, plus save+restore on `auto`+`pop`.
 * Hash → `scrollIntoView` with `scroll-behavior` only (`scroll` / `scroll-target` skipped).
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

    if (hash) {
      this.scrollToHash(hash, to.route.scrollBehavior);
      return;
    }

    const policy = to.route.scrollPolicy;
    if (policy !== 'top' && policy !== 'auto') return;

    const restoring = policy === 'auto' && action === 'pop';
    const y = restoring ? this.positions.get(to.pathname + to.search) : 0;
    if (y === undefined) return;

    const behavior = resolveNativeScrollBehavior(to.route.scrollBehavior);

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

  private scrollToHash(hash: string, scrollBehavior?: ScrollBehaviorAttr | null): void {
    const id = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!id) return;
    const behavior = resolveNativeScrollBehavior(scrollBehavior);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior });
    });
  }
}

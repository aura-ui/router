import type { MatchedRouteInfo, NavigationCommittedContext } from '../../aura-routing-engine/core';

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

  handleCommit(ctx: NavigationCommittedContext): void {
    this.saveLeavingRoute(ctx.from);
    this.applyTargetPolicy(ctx);
  }

  private saveLeavingRoute(from: MatchedRouteInfo | null): void {
    if (!from || from.route.scrollPolicy !== 'restore') return;
    this.positions.set(this.navigationKey(from), this.container.scrollY);
  }

  private applyTargetPolicy(ctx: NavigationCommittedContext): void {
    if (ctx.hash) return;

    const policy = ctx.to.route.scrollPolicy;
    if (policy === 'manual') return;

    if (policy === 'restore' && ctx.action === 'pop') {
      const saved = this.positions.get(this.navigationKey(ctx.to));
      if (saved !== undefined) this.scrollTo(saved);
      return;
    }

    if (policy === 'top' || policy === 'restore') {
      this.scrollTo(0);
    }
  }

  private navigationKey(info: MatchedRouteInfo): string {
    return info.pathname + info.search;
  }

  private scrollTo(y: number): void {
    requestAnimationFrame(() => this.container.scrollTo(0, y));
  }
}

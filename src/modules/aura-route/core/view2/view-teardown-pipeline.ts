import {
  commitStaged,
  finalizeLeave,
  rollbackStaged,
  unmountOnLeave,
  unmountParamChangeOutgoing,
} from '../view/outlet';

import type { RouteUnmountOptions } from '../types';

import type { ViewContext } from './view-context';

/** Clears transition inline styles and cancels element animations. */
function resetViewRootPresentation(root: HTMLElement): void {
  root.style.removeProperty('opacity');
  root.style.removeProperty('transform');
  root.getAnimations?.().forEach((animation) => animation.cancel());
}

/**
 * Post-render teardown: unmount, promote staged view, rollback in-flight stage.
 */
export class ViewTeardownPipeline {
  private readonly ctx: ViewContext;

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  commitStaged(): void {
    this.ctx.mount = commitStaged(this.ctx.mount);
  }

  /**
   * Roll back staged mount and transition presentation without post-commit teardown.
   *
   * @see rollbackStaged — replace vs stage semantics in `view/outlet.ts`.
   */
  revertInFlight(): void {
    this.ctx.mount = rollbackStaged(this.ctx.mount);
    this.ctx.renderSignal.cancel();
    this.clearViewPresentation();
  }

  /** Detaches or destroys exit view; param remount only clears a lingering outgoing handle. */
  onUnmount(options?: RouteUnmountOptions): void {
    this.ctx.renderSignal.cancel();

    const preserveView = this.ctx.config.route.preserve.view;
    const paramChange = this.ctx.paramChangeRemount;
    this.ctx.paramChangeRemount = false;

    const { snapshot, detachedRoot } = paramChange
      ? unmountParamChangeOutgoing(this.ctx.mount, preserveView)
      : unmountOnLeave(this.ctx.mount, preserveView);

    this.ctx.mount = finalizeLeave(snapshot, preserveView, detachedRoot);

    if (preserveView && detachedRoot) {
      this.ctx.config.cache.put(
        options?.cacheKey ?? this.ctx.lastCacheKey ?? this.ctx.config.route.path,
        detachedRoot,
      );
    }
  }

  private clearViewPresentation(): void {
    const { activeHandle, stageOutgoingHandle } = this.ctx.mount;
    const roots = [activeHandle?.viewRoot, stageOutgoingHandle?.viewRoot];

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      if (root) resetViewRootPresentation(root);
    }
  }
}

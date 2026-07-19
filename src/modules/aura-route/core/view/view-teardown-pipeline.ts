import type { RouteUnmountOptions } from '../types';

import {
  finalizeLeave,
  promoteStagedView,
  rollbackUncommittedMount,
  unmountOnLeave,
  unmountParamChangeOutgoing,
} from './outlet-adapter';
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
    this.ctx.mount = promoteStagedView(this.ctx.mount);
  }

  /** Roll back uncommitted view mount without post-commit teardown. */
  revertInFlight(): void {
    this.ctx.mount = rollbackUncommittedMount(this.ctx.mount);
    this.ctx.renderSignal.cancel();
    this.clearViewPresentation();
  }

  /** Detaches or destroys exit view; param remount only clears a lingering outgoing handle. */
  onUnmount(options?: RouteUnmountOptions): void {
    this.ctx.renderSignal.cancel();

    const keepDom = this.ctx.config.route.cache.dom;
    const paramChange = this.ctx.paramChangeRemount;
    this.ctx.paramChangeRemount = false;

    const { snapshot, detachedRoot } = paramChange
      ? unmountParamChangeOutgoing(this.ctx.mount, keepDom)
      : unmountOnLeave(this.ctx.mount, keepDom);

    this.ctx.mount = finalizeLeave(snapshot, keepDom, detachedRoot);

    if (keepDom && detachedRoot) {
      this.ctx.config.cache.put(
        options?.domCacheKey ?? this.ctx.lastCacheKey ?? this.ctx.config.route.path,
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

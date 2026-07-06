import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { EMPTY_MOUNT, type MountSnapshot } from './outlet-adapter';
import type { RouteViewConfig } from './types';
import { AbortScope } from '../../../aura-utils/async/abort-scope';

/** Mutable view state shared by render and teardown pipelines. */
export class ViewContext {
  readonly config: RouteViewConfig;
  readonly getPassId: () => number;
  readonly renderSignal = new AbortScope();

  mount: MountSnapshot = { ...EMPTY_MOUNT };
  /** Fallback when {@link RouteUnmountOptions.cacheKey} is omitted. */
  lastCacheKey: string | null = null;
  /** Set at the start of {@link RouteViewController.render} for param remount. */
  paramChangeRemount = false;

  constructor(config: RouteViewConfig, getPassId: () => number) {
    this.config = config;
    this.getPassId = getPassId;
  }

  get nestedOutlet(): AuraOutlet | null {
    return this.mount.nestedOutlet;
  }

  get signal(): AbortSignal {
    return this.renderSignal.signal;
  }
}

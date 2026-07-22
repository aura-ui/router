import type { LinkPrefetchModeResolver } from '../../user-actions/link-prefetch-intent';
import { LinkPrefetchIntentTracker } from '../../user-actions/link-prefetch-intent';

import { PrefetchIntentBus } from './bus';

export type LinkIntentSourceConfig = {
  linksSelector?: string;
  resolveMode: LinkPrefetchModeResolver;
};

/** Bridges link DOM events → {@link PrefetchIntentBus}. */
export class LinkIntentSource {
  private readonly tracker: LinkPrefetchIntentTracker;

  constructor(bus: PrefetchIntentBus, config: LinkIntentSourceConfig) {
    this.tracker = new LinkPrefetchIntentTracker({
      linksSelector: config.linksSelector,
      resolveMode: config.resolveMode,
      handlers: {
        scheduleIntent: (href, mode) => {
          bus.emit({ type: 'schedule', href, mode, source: 'link' });
        },
        cancelIntent: (href) => {
          bus.emit({ type: 'cancel', href, source: 'link' });
        },
      },
    });
  }

  start(): void {
    this.tracker.start();
  }

  stop(): void {
    this.tracker.stop();
  }

  /** Same as {@link stop} — tracker has no extra teardown beyond pausing listeners. */
  destroy(): void {
    this.stop();
  }
}

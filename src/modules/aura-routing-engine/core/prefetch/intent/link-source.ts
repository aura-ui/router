import { LinkPrefetchIntentTracker } from '../../user-actions/link-prefetch-intent';
import type { PrefetchIntentBus } from './bus';
import type { PrefetchMode } from '../types';

export type LinkIntentSourceConfig = {
  linksSelector?: string;
  defaultMode?: PrefetchMode;
};

/** Bridges link DOM events → {@link PrefetchIntentBus}. */
export class LinkIntentSource {
  private readonly tracker: LinkPrefetchIntentTracker;

  constructor(bus: PrefetchIntentBus, config: LinkIntentSourceConfig = {}) {
    this.tracker = new LinkPrefetchIntentTracker({
      linksSelector: config.linksSelector,
      defaultMode: config.defaultMode,
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

  destroy(): void {
    this.tracker.destroy();
  }
}

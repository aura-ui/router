import type { FailedNavigation } from '../failure';
import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';

/** How the address bar came to match the navigation target. */
export type UrlAlignedSource = 'write' | 'browser';

type NavId = { id: number };
type NavEndpoints = {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
};

/**
 * Sync navigation event stream. Extend as pipeline emit points land (EB1).
 * Prefetch stays on {@link ../prefetch/intent/bus!PrefetchIntentBus}.
 *
 * @see docs/todo/EVENT_BUS.md
 */
export type EngineEvent =
  | (NavId & NavEndpoints & { type: 'navigation:start' })
  | (NavId & NavEndpoints & {
      type: 'navigation:url-aligned';
      hash: string;
      source: UrlAlignedSource;
    })
  | (NavId & NavEndpoints & {
      type: 'navigation:commit:end';
      hash: string;
    })
  | (NavId & { type: 'navigation:finish' })
  | (NavId & { type: 'navigation:cancel'; reason?: string })
  | (NavId & { type: 'navigation:redirect'; url: string; replace: boolean })
  | (NavId & { type: 'navigation:error'; failure: FailedNavigation });

export type EngineEventType = EngineEvent['type'];

export type EngineEventListener = (event: EngineEvent) => void;

import type { NavigationFailure } from '../failure';
import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { DocumentMetaValues } from '../document';

/** How the address bar came to match the navigation target. */
export type UrlAlignedSource = 'write' | 'browser';

type NavId = { id: number };
type NavEndpoints = {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
};
/** Route identity in the tree — `pattern` is unique (`nodesByPattern`). */
type NodeRef = { nodeId: string; pattern: string };

/**
 * Sync navigation / load event stream (EB0–EB1).
 * Prefetch stays on {@link ../prefetch/intent/bus!PrefetchIntentBus}.
 *
 */
export type EngineEvent =
  | (NavId & NavEndpoints & { type: 'navigation:start' })
  | (NavId & NavEndpoints & {
      type: 'navigation:url-aligned';
      hash: string;
      source: UrlAlignedSource;
    })
  | (NavId & { type: 'navigation:prepare:start' })
  | (NavId & { type: 'navigation:prepare:end' })
  | (NavId & { type: 'navigation:commit:start' })
  | (NavId & NavEndpoints & {
      type: 'navigation:commit:end';
      hash: string;
      /** Document meta from the leaf url view for this navigation (attrs still win in apply). */
      htmlMeta: DocumentMetaValues | undefined;
    })
  | (NavId & { type: 'navigation:finish' })
  | (NavId & { type: 'navigation:cancel'; reason?: string })
  | (NavId & { type: 'navigation:redirect'; url: string; replace: boolean })
  | (NavId & { type: 'navigation:error'; failure: NavigationFailure })
  /** Stay on committed route after cancel-pending; host re-syncs active links / branch. */
  | { type: 'navigation:nav-state-restore'; to: MatchedRouteInfo }
  | (NavId & NodeRef & { type: 'node:activate' })
  | (NavId & NodeRef & { type: 'node:deactivate' })
  | (NavId & NodeRef & { type: 'load:start' })
  | (NavId & NodeRef & { type: 'load:end' })
  | (NavId & NodeRef & { type: 'load:error'; error: unknown });

export type EngineEventType = EngineEvent['type'];

export type EngineEventListener = (event: EngineEvent) => void;

import type { MatchedRouteInfo } from './aura-routing-url-matcher';

/** Фаза pipeline, на которой упала навигация (не lifecycle `error`). */
export type NavigationErrorPhase =
  | 'reentered'
  | 'leave'
  | 'enter'
  | 'load'
  | 'leaving'
  | 'render'
  | 'entering';

export interface NavigationErrorDetail {
  error: unknown;
  url: string;
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  phase: NavigationErrorPhase;
  /** `true` только после failed `render` — URL и UI целевого route закоммичены. */
  committed: boolean;
}

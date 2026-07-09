import { parsePath } from '../../../aura-utils/misc/url';
import type {
  PrefetchConfig,
  PrefetchMode,
  PrefetchPlanContext,
  PrefetchSkipReason,
} from './types';

export const DEFAULT_INTENT_DELAY_MS = 50;
export const DEFAULT_STALE_TIME_MS = 30_000;
export const DEFAULT_MAX_AGE_MS = 30_000;
export const VIEW_PREFETCH_MIN_CONFIDENCE = 0.8;
export const DATA_PREFETCH_MIN_CONFIDENCE = 0.3;

/**
 * Centralized prefetch rules: URL normalization, mode delays, confidence, and skip decisions.
 */
export class PrefetchPolicy {
  private readonly config: PrefetchConfig;

  constructor(config: PrefetchConfig = {}) {
    this.config = config;
  }

  normalizeHref(href: string): string | null {
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('//')) return null;
    if (trimmed.startsWith('#')) return null;

    const { pathname, search, hash } = parsePath(trimmed);
    if (!pathname) return null;
    return pathname + search + hash;
  }

  delayFor(mode: PrefetchMode): number {
    switch (mode) {
      case 'intent':
      case 'render':
        return this.config.intentDelayMs ?? DEFAULT_INTENT_DELAY_MS;
      case 'viewport':
        return this.config.viewportDelayMs ?? 0;
      case 'tap':
        return this.config.tapDelayMs ?? 0;
      case 'manual':
      case 'none':
        return 0;
    }
  }

  confidenceFor(mode: PrefetchMode): number {
    switch (mode) {
      case 'none':
        return 0;
      case 'intent':
        return 0.3;
      case 'viewport':
        return 0.5;
      case 'tap':
        return 0.85;
      case 'render':
        return 0.9;
      case 'manual':
        return 1;
    }
  }

  shouldPrefetchView(ctx: PrefetchPlanContext): boolean {
    if (ctx.mode === 'manual' || ctx.mode === 'tap') return true;
    return ctx.confidence >= VIEW_PREFETCH_MIN_CONFIDENCE;
  }

  shouldPrefetchData(ctx: PrefetchPlanContext): boolean {
    return ctx.confidence >= DATA_PREFETCH_MIN_CONFIDENCE;
  }

  skipReason(input: {
    href: string;
    mode: PrefetchMode;
    lastPrefetchAt?: number;
    force?: boolean;
  }): PrefetchSkipReason | null {
    const { href, mode, lastPrefetchAt, force } = input;

    if (mode === 'none') return 'disabled';
    if (force) return null;
    if (this.isSaveDataPreferred()) return 'save-data';
    if (!this.normalizeHref(href)) return 'invalid-href';

    const currentHref = this.config.currentHref?.() ?? '';
    if (currentHref && this.isHashOnlyNavigation(href, currentHref)) return 'hash-only';

    const staleTime = this.config.staleTimeMs ?? DEFAULT_STALE_TIME_MS;
    if (lastPrefetchAt !== undefined && Date.now() - lastPrefetchAt < staleTime) {
      return 'same-route-fresh';
    }

    return null;
  }

  /**
   * Stricter than engine navigation hash-only checks: `/page` -> `/page#section`
   * can still prefetch content, but `/page#old` -> `/page#new` should not.
   */
  isHashOnlyNavigation(href: string, currentHref: string): boolean {
    const next = parsePath(href);
    const current = parsePath(currentHref);
    const sameRoute = next.pathname === current.pathname && next.search === current.search;
    return Boolean(sameRoute && current.hash && next.hash && next.hash !== current.hash);
  }

  private isSaveDataPreferred(): boolean {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return Boolean(connection?.saveData);
  }
}

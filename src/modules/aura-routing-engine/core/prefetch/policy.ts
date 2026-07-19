import { splitAppHref } from '../../../aura-utils/misc/url';
import { ENGINE_DEFAULTS } from '../aura-routing-engine-config';
import {
  isHashOnlyChange,
  resolveDocumentHref,
} from '../link-active/app-href';

import type {
  PrefetchConfig,
  PrefetchMode,
  PrefetchPlanContext,
  PrefetchSkipReason,
} from './types';

export const VIEW_PREFETCH_MIN_CONFIDENCE = 0.8;
export const DATA_PREFETCH_MIN_CONFIDENCE = 0.3;

/** PrefetchConfig with ENGINE_DEFAULTS.prefetch filled in. */
export type ResolvedPrefetchConfig = PrefetchConfig & {
  defaultMode: PrefetchMode;
  intentDelayMs: number;
  viewportDelayMs: number;
  tapDelayMs: number;
  staleTimeMs: number;
  maxAgeMs: number;
};

/**
 * Centralized prefetch rules: URL normalization, mode delays, confidence, and skip decisions.
 */
export class PrefetchPolicy {
  private readonly config: ResolvedPrefetchConfig;

  constructor(config: PrefetchConfig = {}) {
    this.config = { ...ENGINE_DEFAULTS.prefetch, ...config };
  }

  normalizeHref(href: string): string | null {
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('//')) return null;
    if (trimmed.startsWith('#')) return null;

    return resolveDocumentHref(trimmed);
  }

  delayFor(mode: PrefetchMode): number {
    switch (mode) {
      case 'intent':
      case 'render':
        return this.config.intentDelayMs;
      case 'viewport':
        return this.config.viewportDelayMs;
      case 'tap':
        return this.config.tapDelayMs;
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

    const normalized = this.normalizeHref(href);
    if (!normalized) return 'invalid-href';

    const currentHref = this.config.currentHref?.() ?? '';
    if (
      currentHref &&
      isHashOnlyChange(splitAppHref(normalized), splitAppHref(currentHref), {
        requireExistingHash: true,
      })
    ) {
      return 'hash-only';
    }

    if (
      lastPrefetchAt !== undefined &&
      Date.now() - lastPrefetchAt < this.config.staleTimeMs
    ) {
      return 'same-route-fresh';
    }

    return null;
  }

  private isSaveDataPreferred(): boolean {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return Boolean(connection?.saveData);
  }
}

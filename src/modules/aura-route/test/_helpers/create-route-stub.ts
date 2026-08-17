import { NO_CACHE } from '../../../aura-routing-engine/core';
import { NO_TRANSITION } from '../../core/attr/transition-attr-parser';
import type { AuraRouteInterface } from '../../core/types';

/**
 * Full {@link AuraRouteInterface} stub for controller / pipeline tests.
 * `extract` is always `string | null` even when omitted from `overrides`.
 */
export function createRouteStub(overrides: Partial<AuraRouteInterface> = {}): AuraRouteInterface {
  const { extract = null, ...rest } = overrides;
  return {
    path: '/page',
    layout: '',
    redirect: '',
    view: null,
    loadingTemplate: '',
    loadingBodyClass: null,
    loadingStartEvent: null,
    loadingEndEvent: null,
    errorTemplate: '',
    scrollPolicy: null,
    scrollTarget: null,
    scrollBehavior: null,
    metaTitle: null,
    metaDescription: null,
    cacheTime: null,
    cacheRefresh: null,
    cache: NO_CACHE,
    transition: NO_TRANSITION,
    type: 'page',
    hasLayout: false,
    hasViewContent: false,
    hasGuard: false,
    hasLeave: false,
    hasLoad: false,
    hasTransitionIn: false,
    hasReady: false,
    hasAsyncContent: false,
    hasSyncContent: false,
    ...rest,
    extract,
  };
}

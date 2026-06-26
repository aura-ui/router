export { PrefetchPipeline } from './pipeline';
export { PrefetchPlanResolver } from './plan';
export { PrefetchRunStore } from './store';
export { PrefetchIntentBus } from './intent/bus';
export { LinkIntentSource } from './intent/link-source';
export { ContentPrefetchExecutor } from './executors/content';
export { DataPrefetchExecutor } from './executors/data';
export {
  DEFAULT_INTENT_DELAY_MS,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_STALE_TIME_MS,
  delayForMode,
  isHashOnlyNavigation,
  isSaveDataPreferred,
  normalizePrefetchHref,
  shouldSkipPrefetch,
} from './policy';
export type {
  PrefetchConfig,
  PrefetchExecutor,
  PrefetchIntent,
  PrefetchMode,
  PrefetchOptions,
  PrefetchPipelineDeps,
  PrefetchPlan,
  PrefetchRunContext,
  PrefetchSkipReason,
  SpeculationPrefetchPort,
} from './types';

/** @deprecated Use {@link PrefetchPipeline}. */
export { PrefetchPipeline as PrefetchController } from './pipeline';

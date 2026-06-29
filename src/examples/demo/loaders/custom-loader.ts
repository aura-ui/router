import type { LoaderFn } from '../../../modules/aura-routing-engine/core';

export const customLoader: LoaderFn = async () => 'custom loader content';

export const CUSTOM_LOADER_TYPE = 'custom-loader' as const;

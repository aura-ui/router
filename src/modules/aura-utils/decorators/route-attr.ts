import { attr, type AttrConfig } from './attr';

/** Route-oriented `@attr` preset: `inherit: true`, `cached: true`, `readonly: true`. */
export const routeAttr = <T = string>(config: AttrConfig<T> = {}) =>
  attr({ inherit: true, cached: true, readonly: true, ...config });

routeAttr.clear = attr.clear;

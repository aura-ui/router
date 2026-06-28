import type { MatchedRouteInfo } from '../match/url-matcher';
import { getActiveChain } from '../route-tree/matched-chain';
import { contentDescriptorFromRoute } from './descriptor';
import type { ContentDescriptor } from './types';
import type { ContentResolver } from './content-resolver';

export type ContentLoadServiceDeps = {
  resolver: ContentResolver;
};

/**
 * Router-owned content load API — shared by navigation render and prefetch executors.
 */
export class ContentLoadService {
  private readonly resolver: ContentResolver;

  constructor(deps: ContentLoadServiceDeps) {
    this.resolver = deps.resolver;
  }

  resolve(
    descriptor: ContentDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
  ) {
    return this.resolver.resolve(descriptor, { routeInfo, signal });
  }

  prefetchBranch(chain: readonly MatchedRouteInfo[], signal: AbortSignal): Promise<void> {
    return Promise.all(
      chain.map((info) => this.prefetchNode(info, signal)),
    ).then(() => undefined);
  }

  prefetchNode(info: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    const descriptor = contentDescriptorFromRoute(info.route);
    if (descriptor.kind === 'content' && !descriptor.loader.trim()) {
      return Promise.resolve();
    }

    return this.resolver.prefetch(descriptor, { routeInfo: info, signal });
  }

  prefetchLeaf(leaf: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    return this.prefetchBranch(getActiveChain(leaf), signal);
  }
}

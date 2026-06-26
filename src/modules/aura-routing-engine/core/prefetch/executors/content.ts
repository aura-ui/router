import type { ContentLoadService } from '../../content/content-load-service';
import type { PrefetchExecutor, PrefetchPlan, PrefetchRunContext } from '../types';

/** Prefetch view content via registry descriptors + router-owned cache. */
export class ContentPrefetchExecutor implements PrefetchExecutor {
  readonly id = 'content';

  private readonly content: ContentLoadService;

  constructor(content: ContentLoadService) {
    this.content = content;
  }

  run(plan: PrefetchPlan, ctx: PrefetchRunContext): Promise<void> {    return this.content.prefetchBranch(plan.chain, ctx.signal);
  }
}

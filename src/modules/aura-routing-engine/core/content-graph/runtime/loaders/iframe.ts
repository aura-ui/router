import { escapeHtml } from '../../../../../aura-utils/misc';
import type { ContentResult, LoaderType, LoadContext } from '../../types';
import { Loader } from '../loader';

export class IframeLoader extends Loader {
  static readonly type = 'iframe' as const satisfies LoaderType;

  readonly type = IframeLoader.type;

  load(ctx: LoadContext): Promise<ContentResult | null> {
    return Promise.resolve({
      kind: 'markup',
      markup: `<iframe src="${escapeHtml(ctx.ref)}" loading="lazy"></iframe>`,
    });
  }
}

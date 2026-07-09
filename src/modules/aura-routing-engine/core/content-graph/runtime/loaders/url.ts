import { extractHtmlFragment } from '../../../../../aura-utils/misc';
import type { LoaderType, LoadContext } from '../../model/types';
import type { ContentResult } from '../../model/result';
import { Loader } from '../loader';

export class UrlLoader extends Loader {
  static readonly type = 'url' as const satisfies LoaderType;

  readonly type = UrlLoader.type;

  async load(ctx: LoadContext): Promise<ContentResult | null> {
    const html = await this.env.fetchText(
      this.env.resolveUrl(ctx.ref),
      ctx.signal,
    );

    if (!ctx.extract) {
      return { kind: 'html', html };
    }

    return { kind: 'html', html: extractHtmlFragment(html, ctx.extract) };
  }
}

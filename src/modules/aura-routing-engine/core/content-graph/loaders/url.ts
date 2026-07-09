import { extractHtmlFragment } from '../../../../aura-utils/misc';
import type { ContentResult, LoaderType, LoadContext } from '../types';
import { Loader } from '../loader';

export class UrlLoader extends Loader {
  static readonly type = 'url' as const satisfies LoaderType;
  readonly type = UrlLoader.type;

  async load(ctx: LoadContext): Promise<ContentResult | null> {
    const html = await this.env.fetchText(this.env.resolveUrl(ctx.ref), ctx.signal);
    return {
      kind: 'html',
      html: ctx.extract ? extractHtmlFragment(html, ctx.extract) : html,
    };
  }
}

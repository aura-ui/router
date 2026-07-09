import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';
import type { ViewLoaderEnv, ViewLoadResult, ViewLoadContext, LoaderFn } from './types';

/** Class-based view loader; register via {@link LoaderRegistry.register}. */
export abstract class Loader {
  protected readonly env: ViewLoaderEnv;
  readonly type: LoaderId;

  constructor(env: ViewLoaderEnv, typeOverride?: LoaderId) {
    this.env = env;
    if (typeOverride !== undefined) {
      this.type = typeOverride;
      return;
    }
    const ctor = this.constructor as typeof Loader & { type?: LoaderId };
    if (typeof ctor.type !== 'string') {
      throw new TypeError(`${ctor.name} requires static readonly type`);
    }
    this.type = ctor.type;
  }

  abstract load(ctx: ViewLoadContext): Promise<ViewLoadResult | null>;
}

export type LoaderClass = {
  new (env: ViewLoaderEnv): Loader;
  readonly type: LoaderId;
};

/** Wraps {@link LoaderFn} from `register(type, fn)`; string → html, `Node` → fragment. */
export class FnLoader extends Loader {
  private readonly fn: LoaderFn;

  constructor(env: ViewLoaderEnv, loaderId: LoaderId, fn: LoaderFn) {
    super(env, loaderId);
    this.fn = fn;
  }

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    const payload = await this.fn(ctx);
    if (payload == null) return null;
    if (typeof payload === 'string') return { kind: 'html', html: payload };
    return { kind: 'fragment', node: toFragment(payload) };
  }
}

function toFragment(node: Node): DocumentFragment {
  if (node instanceof DocumentFragment) return node;
  const fragment = document.createDocumentFragment();
  fragment.appendChild(node);
  return fragment;
}

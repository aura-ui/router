import type { LoaderType } from '../../../aura-route/core/attr/view-attr-parser';
import type { ViewLoaderEnv, ViewLoadResult, ViewLoadContext, LoaderFn } from './types';

/** Class-based view loader; register via {@link LoaderRegistry.register}. */
export abstract class Loader {
  protected readonly env: ViewLoaderEnv;

  constructor(env: ViewLoaderEnv) {
    this.env = env;
  }

  abstract readonly type: LoaderType;

  abstract load(ctx: ViewLoadContext): Promise<ViewLoadResult | null>;
}

export type LoaderClass = {
  new (env: ViewLoaderEnv): Loader;
  readonly type: LoaderType;
};

/** Wraps {@link LoaderFn} from `register(type, fn)`; string → html, `Node` → fragment. */
export class FnLoader extends Loader {
  readonly type: LoaderType;
  private readonly fn: LoaderFn;

  constructor(env: ViewLoaderEnv, type: LoaderType, fn: LoaderFn) {
    super(env);
    this.type = type;
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

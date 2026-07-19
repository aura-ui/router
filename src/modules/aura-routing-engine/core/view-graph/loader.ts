import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';

import type {
  ViewLoaderEnv,
  ViewLoadContext,
  ViewLoadResult,
  LoaderFn,
} from './types';

/** Class-based view loader; register via {@link LoaderRegistry.register}. */
export abstract class Loader {
  protected readonly env: ViewLoaderEnv;
  readonly type: LoaderId;
  readonly needsData: boolean;

  constructor(env: ViewLoaderEnv, typeOverride?: LoaderId, needsDataOverride?: boolean) {
    this.env = env;
    if (needsDataOverride !== undefined) {
      this.needsData = needsDataOverride;
    }
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
  new(env: ViewLoaderEnv): Loader;
  readonly type: LoaderId;
};

/**
 * Wraps {@link LoaderFn} from `register(type, fn)`.
 * `string` → `{ kind: 'html', value }`; `Node` → `{ kind: 'fragment', value }`.
 */
export class FnLoader extends Loader {
  private readonly fn: LoaderFn;

  constructor(env: ViewLoaderEnv, loaderId: LoaderId, fn: LoaderFn, needsData?: boolean) {
    super(env, loaderId, needsData);
    this.fn = fn;
  }

  async load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    const result = await this.fn(ctx);
    if (result == null) return null;
    if (typeof result === 'string') return { kind: 'html', value: result };
    if (result instanceof Node) return { kind: 'fragment', value: toFragment(result) };
    return result;
  }
}

function toFragment(node: Node): DocumentFragment {
  if (node instanceof DocumentFragment) return node;
  const fragment = document.createDocumentFragment();
  fragment.appendChild(node);
  return fragment;
}

import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import type { ContentEnvironment, ContentResult, LoadContext, LoaderFn } from '../types';

export abstract class Loader {
  protected readonly env: ContentEnvironment;

  constructor(env: ContentEnvironment) {
    this.env = env;
  }

  abstract readonly type: LoaderType;

  abstract load(ctx: LoadContext): Promise<ContentResult | null>;
}

export type LoaderClass = {
  new (env: ContentEnvironment): Loader;
  readonly type: LoaderType;
};

export class FnLoader extends Loader {
  readonly type: LoaderType;
  private readonly fn: LoaderFn;

  constructor(env: ContentEnvironment, type: LoaderType, fn: LoaderFn) {
    super(env);
    this.type = type;
    this.fn = fn;
  }

  async load(ctx: LoadContext): Promise<ContentResult | null> {
    const payload = await this.fn(ctx);
    if (payload == null) return null;
    if (typeof payload === 'string') return { kind: 'html', html: payload };
    return { kind: 'fragment', node: payload as DocumentFragment };
  }
}

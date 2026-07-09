import type { LoaderType } from '../../../../aura-route/core/attr/view-attr-parser';
import type { ContentEnvironment, LoadContext } from '../model/types';
import type { ContentResult } from '../model/result';

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

class FnLoader extends Loader {
  readonly type: LoaderType;
  private readonly run: (ctx: LoadContext) => Promise<ContentResult | null>;

  constructor(
    env: ContentEnvironment,
    type: LoaderType,
    run: (ctx: LoadContext) => Promise<ContentResult | null>,
  ) {
    super(env);
    this.type = type;
    this.run = run;
  }

  load(ctx: LoadContext): Promise<ContentResult | null> {
    return this.run(ctx);
  }
}

export { FnLoader };

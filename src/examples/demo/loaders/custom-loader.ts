import { BaseLoader, type AURARouteContentType } from '../../../modules/aura-content-loaders/core';

export class CustomLoader extends BaseLoader {
  static readonly type = 'custom-loader' as const;

  get type(): AURARouteContentType {
    return CustomLoader.type;
  }

  async load(_url: string): Promise<string> {
    return 'custom loader content';
  }
}

import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { getTemplate } from '../../../../aura-utils/misc';
import { Loader } from '../loader';
import type { ViewLoadContext, ViewLoadResult } from '../types';

/** `layout="tpl-id"` — clones `<template id="tpl-id">`. */
export class TemplateLoader extends Loader {
  static readonly type = 'template' as const satisfies LoaderId;

  load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    return Promise.resolve({ kind: 'fragment', value: getTemplate(ctx.content) });
  }
}

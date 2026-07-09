import { getTemplate } from '../../../../aura-utils/misc';
import type { ViewLoadResult, ViewLoadContext } from '../types';
import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import { Loader } from '../loader';

/** `layout="tpl-id"` — clones `<template id="tpl-id">`. */
export class TemplateLoader extends Loader {
  static readonly type = 'template' as const satisfies LoaderId;

  load(ctx: ViewLoadContext): Promise<ViewLoadResult | null> {
    return Promise.resolve({ kind: 'fragment', node: getTemplate(ctx.content) });
  }
}

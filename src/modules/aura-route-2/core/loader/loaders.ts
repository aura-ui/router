import { getTemplate, loadAndRegisterComponent } from '../../../aura-utils/misc';
import type { LoadContext } from './types';
import { fetchText, resolveRelativeUrl } from './http';

function componentHtml(tagName: string, options: Record<string, unknown>): string {
  const dataAttr = JSON.stringify(options);
  return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
}

function routeOptions(ctx: LoadContext): Record<string, unknown> {
  return {
    href: ctx.route.href,
    pattern: ctx.route.pattern,
    ...(ctx.route.params && { params: ctx.route.params }),
    ...(ctx.route.query && { query: ctx.route.query }),
  };
}

export async function loadTemplate(ctx: LoadContext) {
  return getTemplate(ctx.ref);
}

export async function loadHtml(ctx: LoadContext) {
  return ctx.ref;
}

export async function loadHtmlSrc(ctx: LoadContext) {
  const url = resolveRelativeUrl(ctx.ref);
  return fetchText(url, ctx.signal);
}

export async function loadComponent(ctx: LoadContext) {
  if (!customElements.get(ctx.ref)) {
    throw new Error(`Component '${ctx.ref}' is not registered`);
  }
  return componentHtml(ctx.ref, routeOptions(ctx));
}

export async function loadComponentSrc(ctx: LoadContext) {
  const tagName = await loadAndRegisterComponent(ctx.ref);
  return componentHtml(tagName, routeOptions(ctx));
}

import { getTemplate, loadAndRegisterComponent, escapeHtml } from '../../../../aura-utils/misc';
import type { LoaderFn, LoaderTransport, LoadContext } from '../model/types';
import { routeSnapshot } from './load-context';

function componentMarkup(tagName: string, options: Record<string, unknown>): string {
  const dataAttr = JSON.stringify(options);
  return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
}

export function createBuiltinLoaders(transport: LoaderTransport): ReadonlyArray<{
  readonly type: string;
  readonly load: LoaderFn;
}> {
  const { fetchText, resolveUrl } = transport;

  return [
    {
      type: 'template',
      load: async (ctx) => getTemplate(ctx.ref),
    },
    {
      type: 'html',
      load: async (ctx) => ctx.ref,
    },
    {
      type: 'url',
      load: async (ctx) => fetchText(resolveUrl(ctx.ref), ctx.signal),
    },
    {
      type: 'component',
      load: async (ctx) => loadRegisteredComponent(ctx),
    },
    {
      type: 'import',
      load: async (ctx) => loadComponentFromSrc(ctx),
    },
    {
      type: 'iframe',
      load: async (ctx) =>
        `<iframe src="${escapeHtml(ctx.ref)}" loading="lazy"></iframe>`,
    },
  ];
}

async function loadRegisteredComponent(ctx: LoadContext): Promise<string> {
  if (!customElements.get(ctx.ref)) {
    throw new Error(`Component '${ctx.ref}' is not registered`);
  }
  return componentMarkup(ctx.ref, routeSnapshot(ctx));
}

async function loadComponentFromSrc(ctx: LoadContext): Promise<string> {
  const tagName = await loadAndRegisterComponent(ctx.ref);
  return componentMarkup(tagName, routeSnapshot(ctx));
}

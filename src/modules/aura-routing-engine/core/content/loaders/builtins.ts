import { getTemplate, loadAndRegisterComponent } from '../../../../aura-utils/misc';
import type { LoaderFn, LoaderTransport, LoadContext } from '../model/types';
import { routeSnapshot } from './load-context';

function componentMarkup(tagName: string, options: Record<string, unknown>): string {
  const dataAttr = JSON.stringify(options);
  return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
}

export function createBuiltinLoaders(transport: LoaderTransport): ReadonlyArray<{
  readonly loader: string;
  readonly load: LoaderFn;
}> {
  const { fetchText, resolveUrl } = transport;

  return [
    {
      loader: 'template',
      load: async (ctx) => getTemplate(ctx.content),
    },
    {
      loader: 'html',
      load: async (ctx) => ctx.content,
    },
    {
      loader: 'html-src',
      load: async (ctx) => fetchText(resolveUrl(ctx.content), ctx.signal),
    },
    {
      loader: 'component',
      load: async (ctx) => loadRegisteredComponent(ctx),
    },
    {
      loader: 'component-src',
      load: async (ctx) => loadComponentFromSrc(ctx),
    },
  ];
}

async function loadRegisteredComponent(ctx: LoadContext): Promise<string> {
  if (!customElements.get(ctx.content)) {
    throw new Error(`Component '${ctx.content}' is not registered`);
  }
  return componentMarkup(ctx.content, routeSnapshot(ctx));
}

async function loadComponentFromSrc(ctx: LoadContext): Promise<string> {
  const tagName = await loadAndRegisterComponent(ctx.content);
  return componentMarkup(tagName, routeSnapshot(ctx));
}

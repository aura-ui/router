import { escapeHtml } from '../../../../aura-utils/misc';
import type { LoadContext } from '../types';

export function componentMarkup(tagName: string, context: LoadContext): string {
  const { route, data } = context;
  const { href, pattern, params, query } = route;
  const componentData = {
    href,
    pattern,
    ...(params && { params }),
    ...(query && { query }),
    ...(data !== undefined && { data }),
  };
  const dataAttr = escapeHtml(JSON.stringify(componentData));
  return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
}

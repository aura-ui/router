import type { ViewPayload } from './types';

export type ContentResult =
  | { readonly kind: 'html'; readonly html: string }
  | { readonly kind: 'fragment'; readonly node: DocumentFragment }
  | { readonly kind: 'markup'; readonly markup: string };

export function toViewPayload(result: ContentResult | null): ViewPayload | null {
  if (!result) return null;

  switch (result.kind) {
    case 'html':
    case 'markup':
      return result.kind === 'html' ? result.html : result.markup;
    case 'fragment':
      return result.node;
  }
}

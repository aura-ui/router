import type { LoaderType } from '../../../aura-route/core/attr/view-attr-parser';

export type { LoaderType };

export type ViewPayload = Node | string;

export type ContentKind = 'layout' | 'content';

export type ContentDescriptor = {
  readonly kind: ContentKind;
  readonly loader: LoaderType;
  readonly ref: string;
  readonly cache: boolean;
  readonly extract?: string;
};

export type LoadContext = {
  readonly ref: string;
  readonly kind: ContentKind;
  readonly extract?: string;
  readonly signal: AbortSignal;
  readonly route: {
    readonly href: string;
    readonly pattern: string;
    readonly params?: Record<string, string>;
    readonly query?: Record<string, string>;
  };
  readonly data?: unknown;
};

export type FetchText = (url: string, signal: AbortSignal) => Promise<string>;

export type ContentEnvironment = {
  readonly fetchText: FetchText;
  readonly resolveUrl: (ref: string) => string;
  readonly isSSR: boolean;
};

export type ContentResult =
  | { readonly kind: 'html'; readonly html: string }
  | { readonly kind: 'fragment'; readonly node: DocumentFragment }
  | { readonly kind: 'markup'; readonly markup: string };

export type LoaderFn = (ctx: LoadContext) => Promise<ViewPayload | null>;
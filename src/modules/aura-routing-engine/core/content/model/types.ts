export type ViewPayload = Node | string;

export type ContentKind = 'layout' | 'content';

export type LoaderType =
  | 'template'
  | 'html'
  | 'html-src'
  | 'component'
  | 'component-src'
  | (string & {});

export type ContentDescriptor = {
  readonly kind: ContentKind;
  readonly loader: LoaderType;
  readonly ref: string;
  readonly cache: boolean;
};

export type LoadContext = {
  readonly ref: string;
  readonly signal?: AbortSignal;
  readonly route: {
    readonly href: string;
    readonly pattern: string;
    readonly params?: Record<string, string>;
    readonly query?: Record<string, string>;
  };
};

export type LoaderFn = (ctx: LoadContext) => Promise<ViewPayload | null>;

export type FetchText = (url: string, signal?: AbortSignal) => Promise<string>;

export type LoaderTransport = {
  readonly fetchText: FetchText;
  readonly resolveUrl: (path: string) => string;
};

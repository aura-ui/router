export type ViewPayload = Node | string;

export type ContentKind = 'layout' | 'content';

export type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';
import type { LoaderId } from '../../../../aura-route/core/attr/view-attr-parser';

export type ContentDescriptor = {
  readonly kind: ContentKind;
  readonly loader: LoaderId;
  readonly content: string;
  readonly cache: boolean;
};

export type LoadContext = {
  readonly content: string;
  readonly signal?: AbortSignal;
  readonly route: {
    readonly href: string;
    readonly pattern: string;
    readonly params?: Record<string, string>;
    readonly query?: Record<string, string>;
  };
  readonly data?: unknown;
};

export type LoaderFn = (ctx: LoadContext) => Promise<ViewPayload | null>;

export type FetchText = (url: string, signal?: AbortSignal) => Promise<string>;

export type LoaderTransport = {
  readonly fetchText: FetchText;
  readonly resolveUrl: (path: string) => string;
};

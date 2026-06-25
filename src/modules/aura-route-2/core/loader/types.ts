import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
import type { ViewPayload } from '../view/ports';

export type ContentKind = 'layout' | 'content';

export type LoaderType = 'template' | 'html' | 'html-src' | 'component' | 'component-src' | (string & {});

export type ContentDescriptor = {
  readonly kind: ContentKind;
  readonly loader: LoaderType;
  readonly ref: string;
  readonly cache: boolean;
};

export type ResolveContext = {
  readonly routeInfo: MatchedRouteInfo;
  readonly signal: AbortSignal;
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

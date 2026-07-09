import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';

/** Mount-ready payload: HTML string or DOM node. */
export type ViewPayload = Node | string;

/** `layout` — template slot; `view` — route content from `view` attr. */
export type ViewKind = 'layout' | 'view';

/** Resolved load target built from route attrs and {@link MatchedRouteInfo.resolvedView}. */
export type ViewDescriptor = {
  readonly kind: ViewKind;
  readonly loader: LoaderId;
  readonly content: string;
  /** When true, {@link PayloadCache} is used (`preserve.view` on view routes; layout is always false). */
  readonly cache: boolean;
  /** CSS selector from route `extract` attr (url loader only). */
  readonly extract?: string;
};

/** Per-load input passed to built-in and custom loaders (`LoaderFn` argument). */
export type ViewLoadContext = {
  /** Right-hand side of `view="loader::content"` (or bare content for default `url` loader). */
  readonly content: string;
  readonly kind: ViewKind;
  readonly extract?: string;
  readonly signal: AbortSignal;
  readonly route: {
    /** Current URL: pathname + search + hash. */
    readonly href: string;
    /** Route `path` template in the tree, e.g. `/users/:id` — not the same as `content`. */
    readonly pattern: string;
    readonly params?: Record<string, string>;
    readonly query?: Record<string, string>;
  };
  /** Load-hook snapshot from {@link DataGraph}, when render passes it through. */
  readonly data?: unknown;
};

export type FetchText = (url: string, signal: AbortSignal) => Promise<string>;

/** DI surface for class-based loaders (`fetch`, URL resolution). */
export type ViewLoaderEnv = {
  readonly fetchText: FetchText;
  readonly resolveUrl: (content: string) => string;
  readonly isSSR: boolean;
};

/** Loader-internal result before {@link ViewGraph} collapses to {@link ViewPayload}. */
export type ViewLoadResult =
  | { readonly kind: 'html'; readonly html: string }
  | { readonly kind: 'fragment'; readonly node: DocumentFragment }
  | { readonly kind: 'markup'; readonly markup: string };

/**
 * Custom loader body for `registry.register(type, fn)` / `AuraRouter.registerLoader`.
 * @example
 * // <aura-route path="/users/:id" view="badge::status" />
 * registry.register('badge', async (context) =>
 *   `<span class="${context.content}">${context.route.params?.id ?? ''}</span>`,
 * );
 */
export type LoaderFn = (context: ViewLoadContext) => Promise<ViewPayload | null>;

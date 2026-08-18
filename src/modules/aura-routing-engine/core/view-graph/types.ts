import type { LoaderId } from '../../../aura-route/core/attr/view-attr-parser';
import type { DocumentMetaValues } from '../document';

/** Mount-ready payload: HTML string or DOM node. */
export type ViewPayload = Node | string;

/** Prepare/commit view snapshot: mount payload + colocated document meta (leaf used at commit). */
export type ViewSnapshotEntry = {
  payload: ViewPayload | null;
  meta: DocumentMetaValues | undefined;
};

/** `layout` — template slot; `view` — route content from `view` attr. */
export type ViewKind = 'layout' | 'view';

/**
 * Loader result: tagged `{ kind, value }`.
 * - `html` — document / partial HTML string (`meta` = optional document meta from full documents)
 * - `markup` — synthesized element markup string
 * - `fragment` — mount-ready DOM fragment
 */
export type ViewLoadResult =
  | { readonly kind: 'html'; readonly value: string; readonly meta?: DocumentMetaValues }
  | { readonly kind: 'markup'; readonly value: string }
  | { readonly kind: 'fragment'; readonly value: DocumentFragment };

/** Resolved load target built from route attrs and {@link MatchedRouteInfo.resolvedView}. */
export type ViewDescriptor = {
  readonly kind: ViewKind;
  readonly loader: LoaderId;
  readonly content: string;
  /** When true, ViewGraph long payload cache is used (`cache.view` on view routes; layout is always false). */
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

/**
 * Custom loader body for `registry.register(type, fn)` / `AuraRouter.registerLoader`.
 * May return {@link ViewLoadResult}, or mount-ready {@link ViewPayload}
 * (`string` → `html`, `Node` → `fragment` via {@link FnLoader}).
 * @example
 * // <aura-route path="/users/:id" view="badge::status" />
 * registry.register('badge', async (context) =>
 *   `<span class="${context.content}">${context.route.params?.id ?? ''}</span>`,
 * );
 */
export type LoaderFn = (context: ViewLoadContext) => Promise<ViewLoadResult | null>;

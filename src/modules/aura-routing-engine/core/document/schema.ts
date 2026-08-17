/**
 * Registry of managed `<head>` tags (extract + apply share one list).
 *
 * `document.title` is outside this schema. Owned revert (`data-aura-head`) is implemented
 * in `aura-router/core/document-meta.ts`, not here.
 */

/** Internal spec for one extract/apply `<meta>` or `<link>` slot. */
export type HeadTagSpec = {
  readonly tag: 'meta' | 'link';
  /** Identifying attributes — used for DOM selector and re-create on apply. */
  readonly attrs: Record<string, string>;
  /** Attribute read/written for the slot value (`content` or `href`). */
  readonly valueAttr: 'content' | 'href';
  /** Stable key in {@link DocumentMetaValues.tags}, e.g. `meta:property:og:title`. */
  readonly id: string;
  readonly selector: string;
};

/** App-level configure input; `id`, `selector`, and `valueAttr` are derived. */
export type HeadTagInput = Pick<HeadTagSpec, 'tag' | 'attrs'>;

function headTag(tag: 'meta' | 'link', attrs: Record<string, string>): HeadTagSpec {
  const pairs = Object.entries(attrs);
  return {
    tag,
    attrs,
    valueAttr: tag === 'meta' ? 'content' : 'href',
    id: `${tag}:${pairs.map(([name, value]) => `${name}:${value}`).join(':')}`,
    selector: `${tag}${pairs.map(([name, value]) => `[${name}="${value}"]`).join('')}`,
  };
}

/** {@link HeadTagSpec.id} for `<meta name="description">`. */
export const META_DESCRIPTION_ID = headTag('meta', { name: 'description' }).id;

/** {@link HeadTagSpec.id} for `<link rel="canonical">`. */
export const CANONICAL_ID = headTag('link', { rel: 'canonical' }).id;

/** Built-in SEO / OG / Twitter slots (see {@link getHeadTags}). */
export const DEFAULT_HEAD_TAGS: readonly HeadTagSpec[] = [
  headTag('meta', { name: 'description' }),
  headTag('link', { rel: 'canonical' }),
  headTag('meta', { property: 'og:title' }),
  headTag('meta', { property: 'og:description' }),
  headTag('meta', { property: 'og:image' }),
  headTag('meta', { property: 'og:url' }),
  headTag('meta', { name: 'twitter:card' }),
  headTag('meta', { name: 'twitter:title' }),
  headTag('meta', { name: 'twitter:image' }),
];

let configuredHeadTags: HeadTagSpec[] = [];

/** Default slots plus any tags from {@link configureDocumentMeta}. */
export function getHeadTags(): readonly HeadTagSpec[] {
  return configuredHeadTags.length === 0 ? DEFAULT_HEAD_TAGS : DEFAULT_HEAD_TAGS.concat(configuredHeadTags);
}

/**
 * Register extra extract/apply slots (appended to {@link DEFAULT_HEAD_TAGS}).
 *
 * Call before the first url fetch — e.g. `AuraRouter.configure({ documentMeta: { tags } })`
 * (only runs when `documentMeta.tags` is present in options). Direct call: default `[]` clears.
 */
export function configureDocumentMeta(tags: readonly HeadTagInput[] = []): void {
  configuredHeadTags = tags.map((item) => headTag(item.tag, item.attrs));
}

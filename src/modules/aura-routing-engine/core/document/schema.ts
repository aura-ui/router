/**
 * Registry of `<head>` tags that extract reads and apply writes.
 *
 * `document.title` and `<html lang|dir>` are separate fields, not part of this list.
 * Apply marks tags it creates with `data-aura-head` — see `aura-router/core/document-meta.ts`.
 */

/** One managed `<meta>` or `<link>` slot — shared by extract and apply. */
export type HeadTagSpec = {
  readonly tag: 'meta' | 'link';
  /** Identifying attributes — used to build the DOM selector. */
  readonly attrs: Record<string, string>;
  /** Where the value lives: `content` for meta, `href` for link. */
  readonly valueAttr: 'content' | 'href';
  /** Stable key in {@link DocumentMetaValues.tags}, e.g. `meta:property:og:title`. */
  readonly id: string;
  /** CSS selector used to find the tag in `<head>`. */
  readonly selector: string;
};

/** Input for {@link configureDocumentMeta}; `id`, `selector`, and `valueAttr` are derived. */
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

/** Tag id for `<meta name="description">`. */
export const META_DESCRIPTION_ID = headTag('meta', { name: 'description' }).id;

/** Tag id for `<link rel="canonical">`. */
export const CANONICAL_ID = headTag('link', { rel: 'canonical' }).id;

/** Built-in slots: description, canonical, Open Graph, Twitter. */
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

/** Default slots plus any added via {@link configureDocumentMeta}. */
export function getHeadTags(): readonly HeadTagSpec[] {
  return configuredHeadTags.length === 0 ? DEFAULT_HEAD_TAGS : DEFAULT_HEAD_TAGS.concat(configuredHeadTags);
}

/**
 * Register extra `<head>` slots (appended after {@link DEFAULT_HEAD_TAGS}).
 *
 * Call before the first url fetch — e.g. via `AuraRouter.configure({ documentMeta: { tags } })`.
 * Passing `[]` clears configured slots.
 */
export function configureDocumentMeta(tags: readonly HeadTagInput[] = []): void {
  configuredHeadTags = tags.map((item) => headTag(item.tag, item.attrs));
}

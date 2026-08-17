/** Spec of a managed `<head>` tag (not `document.title`). */
export type HeadTagSpec = {
  readonly tag: 'meta' | 'link';
  /** Identifying attributes: selector, and written on create. */
  readonly attrs: Record<string, string>;
  /** Attribute that carries the extracted/applied value. */
  readonly valueAttr: 'content' | 'href';
  readonly id: string;
  readonly selector: string;
};

/** User-facing tag to copy from fetched `<head>`. `id` / `selector` / `valueAttr` are derived. */
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

const description = headTag('meta', { name: 'description' });
export const META_DESCRIPTION_ID = description.id;

const canonical = headTag('link', { rel: 'canonical' });
export const CANONICAL_ID = canonical.id;

/** Default extract/apply set. Title is handled separately. */
const defaultHeadTags: readonly HeadTagSpec[] = [
  description,
  canonical,
  headTag('meta', { property: 'og:title' }),
  headTag('meta', { property: 'og:description' }),
  headTag('meta', { property: 'og:image' }),
  headTag('meta', { property: 'og:url' }),
  headTag('meta', { name: 'twitter:card' }),
  headTag('meta', { name: 'twitter:title' }),
  headTag('meta', { name: 'twitter:image' }),
];

let configuredHeadTags: HeadTagSpec[] = [];

/** Defaults plus `configureDocumentMeta(tags)`. */
export function getHeadTags(): readonly HeadTagSpec[] {
  return configuredHeadTags.length === 0 ? defaultHeadTags : defaultHeadTags.concat(configuredHeadTags);
}

/** Replace configured tags. `[]` (or omit) clears. Call before the first fetch. */
export function configureDocumentMeta(tags: readonly HeadTagInput[] = []): void {
  configuredHeadTags = tags.map((item) => headTag(item.tag, item.attrs));
}

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

/** Default extract/apply set. Title is handled separately. */
export const headTags: readonly HeadTagSpec[] = [
  description,
  headTag('link', { rel: 'canonical' }),
  headTag('meta', { property: 'og:title' }),
  headTag('meta', { property: 'og:description' }),
  headTag('meta', { property: 'og:image' }),
  headTag('meta', { property: 'og:url' }),
  headTag('meta', { name: 'twitter:card' }),
  headTag('meta', { name: 'twitter:title' }),
  headTag('meta', { name: 'twitter:image' }),
];

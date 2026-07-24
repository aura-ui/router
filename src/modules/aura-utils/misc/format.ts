/** Converts string to kebab-case notation */
export const toKebabCase = (str: string): string => {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
};

/** Parses `null` and `undefined` as an empty string */
export const parseString = (val: string | null): string => String(val ?? '');

/**
 * Nullable string attr parser for `@attr` / `@routeAttr` with inheritance.
 * `null` when the attribute is absent; trimmed string otherwise.
 */
export function parseNullableString(raw: string | null): string | null {
  if (raw === null) return null;
  return raw.trim();
}

/** Parses comma-separated hook names. `null` when absent or empty. */
export function parseCommaSeparated(val: string | null): string[] | null {
  if (val === null) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
}
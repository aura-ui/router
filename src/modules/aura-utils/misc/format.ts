/** Converts string to kebab-case notation */
export const toKebabCase = (str: string): string => {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
};

/** Parses `null` and `undefined` as an empty string */
export const parseString = (val: string | null): string => String(val ?? '');

/** Parses comma-separated string; absent or empty attr → `null`. */
export function parseCommaSeparated(val: string | null): string[] | null {
  if (val === null) return null;
  const items = val.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}
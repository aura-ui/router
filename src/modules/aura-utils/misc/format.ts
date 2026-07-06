/** Converts string to kebab-case notation */
export const toKebabCase = (str: string): string => {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
};

/** Parses `null` and `undefined` as an empty string */
export const parseString = (val: string | null): string => String(val ?? '');

/** Parses comma-separated hook names. `null` when attr absent; `[]` when empty (explicit opt-out). */
export function parseCommaSeparated(val: string | null): string[] | null {
  if (val === null) return null;
  return val.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Optimized for performance */
export function escapeHtml(value: string): string {
  if (!value) return value;
  let result = '';
  let lastIndex = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '&' || ch === '<' || ch === '>' || ch === '"' || ch === '\'') {
      if (lastIndex !== i) {
        result += value.substring(lastIndex, i);
      }
      lastIndex = i + 1;

      switch (ch) {
        case '&':
          result += '&amp;';
          break;
        case '<':
          result += '&lt;';
          break;
        case '>':
          result += '&gt;';
          break;
        case '"':
          result += '&quot;';
          break;
        case '\'':
          result += '&#39;';
          break;
      }
    }
  }
  if (lastIndex < value.length) {
    result += value.substring(lastIndex);
  }
  return result;
}

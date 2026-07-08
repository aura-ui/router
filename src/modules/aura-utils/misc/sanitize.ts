/** Optimized for performance */
export function escapeHtml(value: string): string {
  const len = value.length;
  if (len === 0) return value;

  const hasEscapeChar =
    value.indexOf('&') !== -1 ||
    value.indexOf('<') !== -1 ||
    value.indexOf('>') !== -1 ||
    value.indexOf('"') !== -1 ||
    value.indexOf('\'') !== -1;

  if (!hasEscapeChar) return value;

  let result = '';
  let lastIndex = 0;
  for (let i = 0; i < len; i++) {
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
  if (lastIndex < len) {
    result += value.substring(lastIndex);
  }
  return result;
}

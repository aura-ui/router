/** Local attr values that reset inherited settings (`none` / `off` / `false`). */
export const OFF_KEYWORDS = ['none', 'off', 'false'] as const;

export function isOffKeyword(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  return (OFF_KEYWORDS as readonly string[]).includes(normalized);
}

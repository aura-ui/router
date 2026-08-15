/** Deduped warns for invalid `path` (match is pathname-only). */
const warned = new Set<string>();

/**
 * Parse `path`: trim; warn on `?` / `#` (value unchanged — fix markup).
 */
export function parsePathAttr(raw: string | null): string | null {
  if (raw === null) return null;

  const path = raw.trim();
  if ((path.includes('?') || path.includes('#')) && !warned.has(path)) {
    warned.add(path);
    console.warn(
      `AuraRoute path="${path}" — matching uses pathname only; do not put ? or # in path. ` +
        `Put search on view (e.g. view="…?*" or view="…?id=:id") and read query in hooks via ctx.to.query.`,
    );
  }
  return path;
}

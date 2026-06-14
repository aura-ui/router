/** Router public API version (not the npm package version). */
export const ROUTER_VERSION = '0.1.0';

const RANGE_RE = /^(>=|<=|>|<|=)(\d+)\.(\d+)\.(\d+)$/;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)/;

const CMP: Record<string, (diff: number) => boolean> = {
  '>=': (d) => d >= 0,
  '>': (d) => d > 0,
  '<=': (d) => d <= 0,
  '<': (d) => d < 0,
  '=': (d) => d === 0,
};

/** Encodes semver as a single number for fast comparison. */
function semverCode(major: number, minor: number, patch: number): number {
  return major * 1_000_000 + minor * 1_000 + patch;
}

/** Parses a semver string; returns 0.0.0 code on failure. */
function parseCode(v: string): number {
  const m = VERSION_RE.exec(v);
  if (!m) return 0;

  const major = m[1];
  const minor = m[2];
  const patch = m[3];
  if (!major || !minor || !patch) return 0;

  return semverCode(+major, +minor, +patch);
}

/** Checks version against a range (">=0.1.0", ">0.2.0", "=0.3.0", etc.). */
export function satisfies(version: string, range: string): boolean {
  const match = RANGE_RE.exec(range.trim());
  if (!match) {
    console.warn(`Invalid router version range: "${range}"`);
    return true;
  }

  const op = match[1];
  const major = match[2];
  const minor = match[3];
  const patch = match[4];
  if (!op || !major || !minor || !patch) return true;

  const cmp = CMP[op];
  if (!cmp) return true;

  const diff = parseCode(version) - semverCode(+major, +minor, +patch);
  return cmp(diff);
}

/** Router public API version (not the npm package version). */
export const ROUTER_VERSION = '0.1.0';

/** Matches ranges like ">=0.1.0", ">0.2.0", "=0.3.0". */
const VERSION_RANGE_PATTERN = /^(>=|<=|>|<|=)(\d+)\.(\d+)\.(\d+)$/;

/** Matches the leading "major.minor.patch" part of a version string. */
const VERSION_STRING_PATTERN = /^(\d+)\.(\d+)\.(\d+)/;

/**
 * Turns major.minor.patch into one number so versions are easy to compare.
 * Example: 1.2.3 → 1002003
 */
function toVersionNumber(major: number, minor: number, patch: number): number {
  return major * 1_000_000 + minor * 1_000 + patch;
}

/** Reads "1.2.3" from a string. Invalid input is treated as 0.0.0. */
function parseVersionNumber(version: string): number {
  const match = VERSION_STRING_PATTERN.exec(version);
  if (!match) return 0;

  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) return 0;

  return toVersionNumber(Number(major), Number(minor), Number(patch));
}

const routerVersionNumber = parseVersionNumber(ROUTER_VERSION);

/**
 * Returns true when version matches the range.
 * Example: satisfies("0.2.0", ">=0.1.0") → true
 */
export function satisfies(version: string, range: string): boolean {
  const rangeMatch = VERSION_RANGE_PATTERN.exec(range.trim());
  if (!rangeMatch) {
    console.warn(`Invalid version range: "${range}"`);
    return true;
  }

  const operator = rangeMatch[1];
  const rangeMajor = rangeMatch[2];
  const rangeMinor = rangeMatch[3];
  const rangePatch = rangeMatch[4];
  if (
    operator === undefined
    || rangeMajor === undefined
    || rangeMinor === undefined
    || rangePatch === undefined
  ) {
    return true;
  }

  const versionNumber = version === ROUTER_VERSION
    ? routerVersionNumber
    : parseVersionNumber(version.trim());

  const rangeNumber = toVersionNumber(
    Number(rangeMajor),
    Number(rangeMinor),
    Number(rangePatch),
  );

  const difference = versionNumber - rangeNumber;

  switch (operator) {
    case '>=': return difference >= 0;
    case '>': return difference > 0;
    case '<=': return difference <= 0;
    case '<': return difference < 0;
    case '=': return difference === 0;
    default: return true;
  }
}

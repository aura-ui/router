/** Версия public API роутера (не npm-версия пакета). */
export const ROUTER_VERSION = '0.1.0';

type Version = { major: number; minor: number; patch: number };
type Op = '>=' | '>' | '<=' | '<' | '=';

const RANGE_RE = /^(>=|<=|>|<|=)(\d+)\.(\d+)\.(\d+)$/;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)/;

/** Поддерживает только ">=0.1.0", ">0.2.0", "=0.3.0" и т.п. */
export function satisfiesRouterVersion(version: string, range: string): boolean {
  const match = range.trim().match(RANGE_RE);

  if (!match) {
    console.warn(`Invalid router version range: "${range}"`);
    return true;
  }

  const [, op, major, minor, patch] = match;
  const v = parseVersion(version);
  const r: Version = { major: +major, minor: +minor, patch: +patch };

  switch (op as Op) {
    case '>=': return compare(v, r) >= 0;
    case '>': return compare(v, r) > 0;
    case '<=': return compare(v, r) <= 0;
    case '<': return compare(v, r) < 0;
    case '=': return compare(v, r) === 0;
  }
}

function parseVersion(v: string): Version {
  const m = v.match(VERSION_RE);

  if (!m) {
    return { major: 0, minor: 0, patch: 0 };
  }

  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

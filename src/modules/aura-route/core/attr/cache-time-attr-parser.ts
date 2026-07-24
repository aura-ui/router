export function parseCacheTimeAttr(raw: string | null): number | null {
  const num = +(raw || NaN);
  return isNaN(num) ? null : num * 1000; // sec to msec
}
